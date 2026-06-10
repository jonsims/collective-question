require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const QRCode = require('qrcode');
const { LOCATIONS, LOCATION_BY_NAME } = require('./locations');

const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/submit'));
app.get('/submit', (req, res) => res.sendFile(path.join(__dirname, 'public', 'submit.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/display', (req, res) => res.sendFile(path.join(__dirname, 'public', 'display.html')));

// ─── Org-AI-maturity whitelist ───────────────────────────────────────────────
// NOTE: internally still called "career" throughout (session.careers,
// careerDistribution, {career, count}) to avoid renaming the load-tested
// machinery. The values are now "where AI sits in your organization" levels.
// These MUST match the <select> options in submit.html exactly.

const VALID_MATURITY = new Set([
  "Not on our radar",
  "Exploring",
  "Piloting",
  "Scaling",
  "Embedded",
  "Leading",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseClaudeJSON(raw) {
  // Strategy 1: direct parse
  try { return JSON.parse(raw); } catch {}
  // Strategy 2: strip code fences
  try {
    const stripped = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(stripped);
  } catch {}
  // Strategy 3: extract first {...} block
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  // All strategies failed
  console.error('[PARSE FAIL] Raw response:', raw);
  throw new Error('Could not parse Claude response');
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Claude API timeout')), ms)),
  ]);
}

function synthesisErrorMessage(err) {
  const msg = err.message || '';
  if (msg.includes('timeout')) return 'Claude API timed out — try again in 30s';
  if (msg.includes('Could not parse')) return 'Response couldn\'t be parsed — retrying usually works';
  if (err.status) return `Claude API error (${err.status}) — try again in 30s`;
  return 'Unexpected error — check server logs';
}

// ─── In-memory session state ────────────────────────────────────────────────

let session = {
  careers: [],
  locations: [],   // array of location names (validated against LOCATIONS)
  talents: [],
  foods: [],       // array of favorite food strings
  questions: [],
  nextId: 1,
  displayState: 'collection',
  act1Result: null,
  act2Result: null,
  recipeResult: null,
  synthesizing: { act1: false, act2: false, recipe: false },
};

function resetSession() {
  session = {
    careers: [],
    locations: [],
    talents: [],
    foods: [],
    questions: [],
    nextId: 1,
    displayState: 'collection',
    act1Result: null,
    act2Result: null,
    recipeResult: null,
    synthesizing: { act1: false, act2: false, recipe: false },
  };
}

function careerDistribution() {
  const counts = {};
  session.careers.forEach(c => { counts[c] = (counts[c] || 0) + 1; });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([career, count]) => ({ career, count }));
}

function locationPoints() {
  // Group submissions by location, return [{name, lat, lng, type, count}]
  const counts = {};
  session.locations.forEach(name => { counts[name] = (counts[name] || 0) + 1; });
  return Object.entries(counts)
    .map(([name, count]) => {
      const loc = LOCATION_BY_NAME.get(name);
      if (!loc) return null;
      return { name, lat: loc.lat, lng: loc.lng, type: loc.type, iso: loc.iso, count };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count);
}

// ─── Public API ─────────────────────────────────────────────────────────────

// QR code — generated locally, no external dependency
app.get('/api/qr', async (req, res) => {
  const url = req.query.url || `${req.protocol}://${req.get('host')}/submit`;
  try {
    const svg = await QRCode.toString(url, { type: 'svg', color: { dark: '#006341', light: '#ffffff' }, width: 300 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    res.status(500).send('QR error');
  }
});

// Total submission count
app.get('/api/count', (req, res) => {
  res.json({ total: session.careers.length });
});

// Locations list (for submit form datalist)
app.get('/api/locations', (req, res) => {
  res.json(LOCATIONS.map(l => l.name));
});

// Submit form
app.post('/api/submit', (req, res) => {
  const { career, location, talent, food, question } = req.body;

  // Validate AI-maturity level (still sent as "career" by the form)
  if (!career || !VALID_MATURITY.has(career)) {
    return res.status(400).json({ error: 'Invalid selection' });
  }
  // "Where would you like to visit" — free text, just required
  if (!location || typeof location !== 'string' || !location.trim()) {
    return res.status(400).json({ error: 'Please tell us where you would like to visit' });
  }
  // Cap total submissions
  if (session.careers.length >= 500) {
    return res.status(429).json({ error: 'Submissions are closed' });
  }

  session.careers.push(career);
  session.locations.push(location.trim().slice(0, 60));

  if (talent && typeof talent === 'string') {
    const t = talent.trim().slice(0, 200);
    if (t) session.talents.push(t);
  }
  if (food && typeof food === 'string') {
    const f = food.trim().slice(0, 100);
    if (f) session.foods.push(f);
  }
  if (question && typeof question === 'string') {
    const q = question.trim().slice(0, 500);
    if (q) session.questions.push({ id: session.nextId++, text: q, timestamp: Date.now() });
  }

  res.json({ ok: true });
});

// Polling endpoint for display page (public)
app.get('/api/state', (req, res) => {
  res.json({
    displayState: session.displayState,
    count: {
      careers: session.careers.length,
      locations: session.locations.length,
      talents: session.talents.length,
      foods: session.foods.length,
      questions: session.questions.length,
    },
    careerDistribution: careerDistribution().slice(0, 12),
    locationPoints: locationPoints(),
    questions: session.questions,
    act1Result: session.act1Result,
    act2Result: session.act2Result,
    recipeResult: session.recipeResult,
    synthesizing: session.synthesizing,
  });
});

// ─── Admin API ───────────────────────────────────────────────────────────────

function checkPin(req, res) {
  if (req.headers['x-admin-pin'] !== ADMIN_PIN) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// Full data for admin view
app.get('/api/admin/data', (req, res) => {
  if (!checkPin(req, res)) return;
  res.json({
    careers: session.careers,
    careerDistribution: careerDistribution(),
    locations: session.locations,
    locationPoints: locationPoints(),
    talents: session.talents,
    foods: session.foods,
    questions: session.questions,
    displayState: session.displayState,
    act1Result: session.act1Result,
    act2Result: session.act2Result,
    recipeResult: session.recipeResult,
    synthesizing: session.synthesizing,
  });
});

// Set display state
app.post('/api/admin/display', (req, res) => {
  if (!checkPin(req, res)) return;
  const { state } = req.body;
  const valid = ['collection', 'career_chart', 'world_map', 'world_map_svg', 'act1_synthesis', 'raw_questions', 'clusters', 'meta_question', 'outlier', 'recipe'];
  if (!valid.includes(state)) return res.status(400).json({ error: 'Invalid state' });
  session.displayState = state;
  res.json({ ok: true, displayState: state });
});

// Delete a question
app.delete('/api/admin/question/:id', (req, res) => {
  if (!checkPin(req, res)) return;
  const id = parseInt(req.params.id);
  session.questions = session.questions.filter(q => q.id !== id);
  res.json({ ok: true });
});

// Reset session (danger zone)
app.post('/api/admin/reset', (req, res) => {
  if (!checkPin(req, res)) return;
  resetSession();
  res.json({ ok: true });
});

// Next session — quick reset between back-to-back sessions
app.post('/api/admin/next-session', (req, res) => {
  if (!checkPin(req, res)) return;
  if (!req.body.confirm) {
    return res.status(400).json({ error: 'Confirmation required. Send { confirm: true }.' });
  }
  resetSession();
  res.json({ ok: true, message: 'Ready for next session' });
});

// Load test data
app.post('/api/admin/load-test-data', (req, res) => {
  if (!checkPin(req, res)) return;
  resetSession();

  // Org-AI-maturity levels (stored as "career"). Weighted like a real room of
  // leaders: an exploring/piloting middle, a few not-yet-started, a handful
  // scaling/embedded, a couple leading. ~35 entries to mirror a 30-person room.
  const careerPicks = [
    "Exploring","Piloting","Exploring","Scaling","Piloting",
    "Not on our radar","Exploring","Embedded","Exploring","Piloting",
    "Scaling","Exploring","Piloting","Leading","Scaling",
    "Exploring","Embedded","Piloting","Not on our radar","Scaling",
    "Exploring","Piloting","Embedded","Scaling","Exploring",
    "Leading","Piloting","Exploring","Piloting","Embedded",
    "Not on our radar","Exploring","Scaling","Leading","Exploring",
  ];

  // "One decision or task you'd hand to AI tomorrow" (stored as "talent").
  // Realistic, varied answers from leaders — decision-making, customer insight,
  // industry/innovation flavored.
  const talentList = ["First-draft competitive analysis","Synthesize customer interview notes","Spot patterns in churn data","Generate customer personas","Scenario planning for a big bet","Pressure-test a pricing decision","Draft board-meeting talking points","Summarize a long market research report","Screen new product ideas fast","Write the first version of a strategy memo","Triage my overflowing inbox","Turn messy survey data into themes","Draft customer-segment profiles","Stress-test assumptions before a launch","Map our competitors' recent moves","Brainstorm names for a new offering","Prep questions for a customer discovery call","Forecast demand under a few scenarios","Draft a job description","Find the story buried in a quarter of metrics","Role-play a tough negotiation","Cut a 30-page report down to one page","Generate counterarguments to my own plan","Draft investor-update emails","Sketch a go-to-market plan","Analyze open-ended feedback at scale","Draft a press release","Compare vendor proposals side by side","Simulate an angry-customer call","Turn a whiteboard photo into a project brief"];

  // Questions about AI's role in decision-making & innovation (stored as
  // "question"), from a room of leaders. ~36 entries — strategic, candid, varied.
  const questionList = ["Where does AI actually improve a decision versus just speed it up?","How do I trust AI insight from data I can't fully verify?","What's AI's real role in our innovation process?","Which decisions should never be delegated to AI?","How do I tell signal from confident nonsense?","How do we keep human judgment central as we scale AI?","What's the first process I should put AI into?","How do I get my leadership team aligned on AI?","How do we measure whether AI is actually creating value?","What customer questions can AI answer that we can't today?","How do I avoid automating a bad process faster?","Where's the line between augmenting people and replacing them?","How do we protect proprietary data when using these tools?","What does an 'AI strategy' even mean for a company our size?","How do I bring skeptical leaders along?","How do we move from pilots to real adoption?","What's the biggest mistake leaders make adopting AI?","How do I keep us from falling behind competitors on this?","Can AI really generate customer insight, or just summarize?","How do I know if an AI-generated analysis is any good?","What should I stop doing now that AI can do it?","How do we build AI literacy across the whole organization?","Where will AI reshape our industry first?","How do I balance moving fast with moving responsibly?","What's a realistic 12-month AI roadmap?","How do we use AI without all sounding the same?","What decisions are leaders too quick to hand to AI?","How do I use AI without eroding my team's skills?","Is AI a sustaining or a disruptive force in our market?","How do we govern AI use without killing experimentation?","What's the ROI question I should actually be asking about AI?","How do I separate AI hype from what's real for us?","Where does AI create advantage versus just become table stakes?","How do we keep customers' trust as we lean on AI more?","What part of our strategy should never be handed to AI?","How do I help my organization innovate with AI, not just adopt it?"];

  // Locations — "where's your hometown," sized to ~34 to match a 30-person room.
  // US-heavy with some international spread so the map still reads well.
  const locationList = [
    "Massachusetts","Massachusetts","Massachusetts","Massachusetts",
    "New York","New York","New York",
    "California","California","California",
    "Texas","Texas",
    "Florida","Florida",
    "Illinois","Illinois",
    "Pennsylvania","Georgia","North Carolina","Ohio","Michigan",
    "Colorado","Washington","Minnesota",
    // International
    "United Kingdom","Canada","Canada","India","India",
    "China","Mexico","Brazil","Germany","Singapore"
  ];

  // Favorite foods — ~34 entries, varied enough for an absurd recipe.
  const foodList = [
    "Pizza","Sushi","Tacos","Pasta","Ramen","Burgers","Mac and cheese",
    "Pho","Pad Thai","Biryani","Dumplings","Korean BBQ","Bagels","Avocado toast",
    "Iced coffee","Croissants","Chocolate chip cookies","Ice cream","Cheesecake","Tiramisu",
    "Chipotle","Five Guys","Dim sum","Hot pot","Empanadas","Ceviche","Tamales",
    "Jollof rice","Caesar salad","Carbonara","Lobster roll","Clam chowder","Nachos","Burritos"
  ];

  session.careers = careerPicks;
  session.locations = locationList;
  session.talents = talentList;
  session.foods = foodList;
  questionList.forEach(text => {
    session.questions.push({ id: session.nextId++, text, timestamp: Date.now() });
  });

  res.json({ ok: true, loaded: {
    careers: session.careers.length,
    locations: session.locations.length,
    talents: session.talents.length,
    foods: session.foods.length,
    questions: session.questions.length
  } });
});

// ─── Synthesis: Act 1 ────────────────────────────────────────────────────────

app.post('/api/admin/synthesize/act1', async (req, res) => {
  if (!checkPin(req, res)) return;
  if (session.synthesizing.act1) return res.status(409).json({ error: 'Synthesis already in progress' });
  if (session.careers.length < 5) return res.status(400).json({ error: 'Need at least 5 submissions first' });

  session.synthesizing.act1 = true;
  try {
    const dist = careerDistribution().slice(0, 10)
      .map(({ career, count }) => `${career}: ${count}`).join(', ');
    const talents = session.talents.join('\n');

    const prompt = `You are helping the facilitator of "Leading With AI," a live session for a room of leaders exploring how to use AI in decision-making and innovation. The room just shared where AI sits in their organization today and one decision or task they'd hand to AI tomorrow. This reveal is itself a live demo of AI-powered audience insight — turning the room's raw responses into insight in real time.

Here is what the room submitted:

Where AI sits in their organizations (distribution): ${dist}
"One decision or task I'd hand to AI tomorrow" (all responses):
${talents}

Write exactly two things:

1. One punchy sentence (under 25 words) reacting to the AI-maturity distribution — warm and a little funny, no shaming the cautious. Reference actual numbers if interesting.

2. One short paragraph (3-4 sentences, under 80 words) that synthesizes the responses into a sharp, insightful portrait of how this room of leaders wants to put AI to work — the kind of read a great customer-insight analyst would surface from open-ended data. Be warm and specific. Find the surprising thing underneath the obvious ones. The last sentence should be the one that makes the room go quiet.

Style note: the people in this room are leaders, not students — never refer to them as students.

Return ONLY valid JSON with no extra text, no markdown, no code fences:
{"career_line":"...","talent_portrait":"..."}`;

    const message = await withTimeout(
      anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
      30000
    );

    const raw = message.content[0].text.trim();
    session.act1Result = parseClaudeJSON(raw);
    res.json({ ok: true, result: session.act1Result });
  } catch (err) {
    console.error('Act 1 synthesis error:', err);
    res.status(500).json({ error: synthesisErrorMessage(err) });
  } finally {
    session.synthesizing.act1 = false;
  }
});

// ─── Synthesis: Act 2 ────────────────────────────────────────────────────────

app.post('/api/admin/synthesize/act2', async (req, res) => {
  if (!checkPin(req, res)) return;
  if (session.synthesizing.act2) return res.status(409).json({ error: 'Synthesis already in progress' });
  if (session.questions.length < 5) return res.status(400).json({ error: 'Need at least 5 questions first' });

  session.synthesizing.act2 = true;
  try {
    const questions = session.questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n');

    const prompt = `You are helping the facilitator of "Leading With AI," a live session for a room of leaders. They each submitted their biggest question about AI's role in decision-making and innovation. Your job is to turn these open-ended responses into insight in real time — the way a sharp customer-insight analyst clusters qualitative data into segments.

Here are all submitted questions:
${questions}

Please do the following:

1. GROUP them into 3-4 thematic clusters (the "segments" of what this room cares about). Give each cluster a short label (3-5 words) and a count.

2. SYNTHESIZE one "meta question" (under 20 words) — the single question that, if answered well, speaks to the most people in the room, including those who didn't know how to phrase what they were feeling.

3. Write a brief rationale (under 30 words) explaining why this question captures the room.

4. SURFACE one "outlier question" — too specific or too different to fit, but worth noting. Add a brief note (under 20 words) on why it stood out.

Style note: the people in this room are leaders, not students — never refer to them as students.

Return ONLY valid JSON with no extra text, no markdown, no code fences:
{"clusters":[{"label":"...","count":N,"example_question":"..."}],"meta_question":"...","meta_question_rationale":"...","outlier_question":"...","outlier_note":"..."}`;

    const message = await withTimeout(
      anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
      30000
    );

    const raw = message.content[0].text.trim();
    session.act2Result = parseClaudeJSON(raw);
    res.json({ ok: true, result: session.act2Result });
  } catch (err) {
    console.error('Act 2 synthesis error:', err);
    res.status(500).json({ error: synthesisErrorMessage(err) });
  } finally {
    session.synthesizing.act2 = false;
  }
});

// ─── Synthesis: Recipe ───────────────────────────────────────────────────────

app.post('/api/admin/synthesize/recipe', async (req, res) => {
  if (!checkPin(req, res)) return;
  if (session.synthesizing.recipe) return res.status(409).json({ error: 'Synthesis already in progress' });
  if (session.foods.length < 5) return res.status(400).json({ error: 'Need at least 5 food submissions first' });

  session.synthesizing.recipe = true;
  try {
    const foods = session.foods.join(', ');

    const prompt = `You are a wildly creative chef helping the facilitator close out "Leading With AI," a session for a room of leaders. The room just submitted their favorite foods. Your job is to invent an absurd, ambitious new dish — pitch it like a bold product innovation — that uses as many of these ingredients/dishes as possible, even if it shouldn't work. (It's a playful demo of generative AI's creative side, so lean into the fun.)

Favorite foods from the room (${session.foods.length} leaders):
${foods}

Create a recipe that:
- Has a memorable, slightly silly name
- References AT LEAST 8 of the actual submitted foods (use them as inspiration even if the original is a dish, e.g. "pizza" → use "pizza dough")
- Lists 8-12 ingredients with playful quantities
- Has 5-7 brief, confident steps (under 25 words each)
- Ends with a single funny tasting note

This is meant to be entertaining, not realistic. Lean into the chaos. Be bold. Be specific. Reference the actual foods the room mentioned.

Return ONLY valid JSON with no extra text, no markdown, no code fences:
{"name":"...","tagline":"...","ingredients":["...","..."],"steps":["...","..."],"tasting_note":"...","foods_used":N}`;

    const message = await withTimeout(
      anthropic.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
      30000
    );

    const raw = message.content[0].text.trim();
    session.recipeResult = parseClaudeJSON(raw);
    res.json({ ok: true, result: session.recipeResult });
  } catch (err) {
    console.error('Recipe synthesis error:', err);
    res.status(500).json({ error: synthesisErrorMessage(err) });
  } finally {
    session.synthesizing.recipe = false;
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🎓 Collective Question running at http://localhost:${PORT}`);
  console.log(`   Submit: http://localhost:${PORT}/submit`);
  console.log(`   Admin:  http://localhost:${PORT}/admin  (PIN: ${ADMIN_PIN})`);
  console.log(`   Display: http://localhost:${PORT}/display\n`);
});
