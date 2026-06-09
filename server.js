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

// ─── Comfort-with-AI whitelist ───────────────────────────────────────────────
// NOTE: internally still called "career" throughout (session.careers,
// careerDistribution, {career, count}) to avoid renaming the load-tested
// machinery. The values are now AI-comfort levels. These MUST match the
// <select> options in submit.html exactly.

const VALID_COMFORT = new Set([
  "Skeptic",
  "Curious but cautious",
  "Experimenting",
  "Regular user",
  "Daily in my workflow",
  "All-in / I teach it",
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

  // Validate comfort level (still sent as "career" by the form)
  if (!career || !VALID_COMFORT.has(career)) {
    return res.status(400).json({ error: 'Invalid comfort selection' });
  }
  // Validate location (now required)
  if (!location || !LOCATION_BY_NAME.has(location)) {
    return res.status(400).json({ error: 'Invalid location' });
  }
  // Cap total submissions
  if (session.careers.length >= 500) {
    return res.status(429).json({ error: 'Submissions are closed' });
  }

  session.careers.push(career);
  session.locations.push(location);

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

  // AI-comfort levels (stored as "career"). Weighted like a real room of
  // entrepreneurship educators: a curious/experimenting middle, a few skeptics,
  // a handful all-in. ~35 entries to mirror a 30-person session.
  const careerPicks = [
    "Curious but cautious","Experimenting","Curious but cautious","Regular user","Experimenting",
    "Skeptic","Experimenting","Daily in my workflow","Curious but cautious","Experimenting",
    "Regular user","Curious but cautious","Experimenting","All-in / I teach it","Regular user",
    "Curious but cautious","Daily in my workflow","Experimenting","Skeptic","Regular user",
    "Curious but cautious","Experimenting","Daily in my workflow","Regular user","Curious but cautious",
    "All-in / I teach it","Experimenting","Regular user","Curious but cautious","Daily in my workflow",
    "Skeptic","Experimenting","Regular user","All-in / I teach it","Daily in my workflow",
  ];

  // "One way I use AI — or want to" (stored as "talent"). Realistic, varied,
  // honest answers from entrepreneurship educators.
  const talentList = ["Drafting rubrics and assignment prompts","Generating case discussion questions","First-pass feedback on rough drafts","Building syllabi faster","I haven't really started, honestly","Brainstorming venture ideas with my class","Summarizing long research papers","Making practice quizzes","Role-playing investor pitches with my class","Translating course materials into other languages","I want to use it for grading but I'm nervous","Coding small classroom tools without knowing how to code","Lesson planning at 11pm","Turning my lectures into study guides","Writing the emails I don't want to write","Generating examples on the fly when someone's stuck","Market research for early-stage ventures","Designing better experiential exercises","Creating personas for customer-discovery practice","Using it as a thought partner when I'm stuck","Building financial models with my teams","Making my dense slides actually readable","I want to but I don't know where to start","Checking my own writing for clarity","Simulating tough customer conversations","Grant proposal first drafts","Explaining one concept five different ways","Honestly, just to feel less behind","Mock interviews before career fairs","Cleaning up messy survey data from class projects"];

  // Questions and concerns about AI (stored as "question"), from entrepreneurship
  // educators. ~36 entries — realistic worries plus genuine curiosity.
  const questionList = ["How do I keep my class from just outsourcing the thinking?","Will AI make the skills I teach obsolete?","How do I grade fairly when I can't tell what's AI-written?","What's the right AI policy for an experiential course?","Am I falling behind the people I teach on this?","How do I teach entrepreneurship when AI can write the whole business plan?","Is it cheating if my class uses AI for customer discovery?","How do I use AI without losing the human relationship in the classroom?","What should I require my class to learn versus let AI handle?","How do I stay current when the tools change every month?","Will my institution support this or punish it?","How do I model good AI use instead of just banning it?","What's the most useful AI tool for a non-technical professor?","How do I assess learning when the output looks the same either way?","Does using AI to grade undermine my credibility?","How do I help skeptical colleagues get on board?","Where's the line between a tool and a crutch in the classroom?","How do I redesign assignments so AI makes them better, not pointless?","Is there a privacy risk in putting other people's work into these tools?","How do I teach judgment when answers are basically free?","What will employers actually expect our graduates to know about AI?","How do I keep the entrepreneurial 'doing' when AI removes the friction?","Should every course have an AI component now?","How do I avoid sounding out of touch to the people I teach?","What's a realistic first step for someone who's nervous?","How do I evaluate which AI tools are worth class time?","Will AI widen the gap between those who can afford the best tools?","How do I protect deep work and reflection in an AI world?","What part of my teaching should I never hand to AI?","How do I get my whole department speaking the same language on this?","Is it okay that I find this exciting and scary at the same time?","What's the most common mistake educators make with AI right now?","How do I make room for this without adding ten hours to my week?","Are we preparing graduates for a world that won't exist by the time they finish?","How do I teach originality when remixing is so easy?","How do I help my class use AI ethically without becoming the police?"];

  // Locations — "where do you teach," sized to ~34 to match a 30-person room.
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

    const prompt = `You are helping a facilitator run a quick, fun live reveal during a session for a room of entrepreneurship educators (college faculty and program directors). The room just shared how comfortable they are with AI and one way they already use it (or wish they could).

Here is what the room submitted:

Self-reported AI comfort levels (distribution): ${dist}
"One way I use AI — or want to" (all responses):
${talents}

Write exactly two things:

1. One punchy sentence (under 25 words) reacting to the comfort distribution — warm and a little funny, no shaming the skeptics. Reference actual numbers if interesting.

2. One short paragraph (3-4 sentences, under 80 words) that synthesizes the "how I use AI" responses into a portrait of where this room of educators actually is with AI right now. Be warm and specific. Find the surprising thing underneath the obvious ones. The last sentence should be the one that makes the room go quiet.

Style note: the people in this room are educators, not students — never refer to them as students. Avoid the word "student" or "students" entirely; if you need to mention the people they teach, say "their classes" or "the people they teach."

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

    const prompt = `You are helping a facilitator analyze the questions and concerns about AI submitted by a room of entrepreneurship educators (college faculty and program directors) during a live session.

Here are all submitted questions and concerns:
${questions}

Please do the following:

1. GROUP them into 3-4 thematic clusters. Give each cluster a short label (3-5 words) and a count.

2. SYNTHESIZE one "meta question" (under 20 words) — the single question that, if answered well, speaks to the most people in the room, including those who didn't know how to phrase what they were feeling.

3. Write a brief rationale (under 30 words) explaining why this question captures the room.

4. SURFACE one "outlier question" — too specific or too different to fit, but worth noting. Add a brief note (under 20 words) on why it stood out.

Style note: the people in this room are educators, not students — never refer to them as students. Avoid the word "student" or "students" entirely; if you need to mention the people they teach, say "their classes" or "the people they teach." You may lightly paraphrase an example_question to honor this, but keep its meaning.

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

    const prompt = `You are a wildly creative chef helping a facilitator close out a live session for a room of entrepreneurship educators. The room just submitted their favorite foods. Your job is to invent an absurd, ambitious recipe that uses as many of these ingredients/dishes as possible — even if it shouldn't work. (It's a playful demo of generative AI, so lean into the fun.)

Favorite foods from the room (${session.foods.length} educators):
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
