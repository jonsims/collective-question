require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/submit'));
app.get('/submit', (req, res) => res.sendFile(path.join(__dirname, 'public', 'submit.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/display', (req, res) => res.sendFile(path.join(__dirname, 'public', 'display.html')));

// ─── In-memory session state ────────────────────────────────────────────────

let session = {
  careers: [],
  talents: [],
  questions: [],
  nextId: 1,
  displayState: 'collection',
  act1Result: null,
  act2Result: null,
  synthesizing: { act1: false, act2: false },
};

function resetSession() {
  session = {
    careers: [],
    talents: [],
    questions: [],
    nextId: 1,
    displayState: 'collection',
    act1Result: null,
    act2Result: null,
    synthesizing: { act1: false, act2: false },
  };
}

function careerDistribution() {
  const counts = {};
  session.careers.forEach(c => { counts[c] = (counts[c] || 0) + 1; });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([career, count]) => ({ career, count }));
}

// ─── Public API ─────────────────────────────────────────────────────────────

// Submit form
app.post('/api/submit', (req, res) => {
  const { career, talent, question } = req.body;
  if (career) session.careers.push(career);
  if (talent && talent.trim()) session.talents.push(talent.trim());
  if (question && question.trim()) {
    session.questions.push({
      id: session.nextId++,
      text: question.trim(),
      timestamp: Date.now(),
    });
  }
  res.json({ ok: true });
});

// Polling endpoint for display page (public)
app.get('/api/state', (req, res) => {
  res.json({
    displayState: session.displayState,
    count: {
      careers: session.careers.length,
      talents: session.talents.length,
      questions: session.questions.length,
    },
    careerDistribution: careerDistribution().slice(0, 12),
    questions: session.questions,
    act1Result: session.act1Result,
    act2Result: session.act2Result,
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
    talents: session.talents,
    questions: session.questions,
    displayState: session.displayState,
    act1Result: session.act1Result,
    act2Result: session.act2Result,
    synthesizing: session.synthesizing,
  });
});

// Set display state
app.post('/api/admin/display', (req, res) => {
  if (!checkPin(req, res)) return;
  const { state } = req.body;
  const valid = ['collection', 'career_chart', 'act1_synthesis', 'raw_questions', 'clusters', 'meta_question', 'outlier'];
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

// Reset session
app.post('/api/admin/reset', (req, res) => {
  if (!checkPin(req, res)) return;
  resetSession();
  res.json({ ok: true });
});

// Load test data
app.post('/api/admin/load-test-data', (req, res) => {
  if (!checkPin(req, res)) return;
  resetSession();

  const careerPicks = ["Veterinarian","Astronaut","Veterinarian","Doctor","Marine Biologist","Princess / Prince","Firefighter","Chef","Artist","YouTuber / Influencer","Lawyer","Scientist","Dancer","President of the United States","Architect","Singer","Engineer","Teacher","Police Officer","Zookeeper","Painter","Fashion Designer","Race Car Driver","Pilot","Nurse","Superhero","Paleontologist (dinosaur stuff)","Spy","Gymnast","Writer","Veterinarian","Marine Biologist","Soccer Player","Chef","Astronaut","Basketball Player","Musician","Fashion Designer","Inventor","Doctor","Zookeeper","Photographer","Actor","Entrepreneur","Scientist","Video Game Designer","Animator","Therapist","Carpenter","Astronaut","Marine Biologist","Doctor","Teacher","Artist","Chef","Athlete (general)","Singer","Lawyer","Veterinarian","Pilot","Dancer","Architect","Scientist","YouTuber / Influencer","Chef","Doctor","Astronaut","Marine Biologist","Soccer Player","Writer","Nurse","Engineer","Fashion Designer","Entrepreneur","Painter","Gymnast","Actor","Firefighter","Marine Biologist","President of the United States","Musician","Architect","Artist","Veterinarian","Teacher"];

  const talentList = ["I can solve a Rubik's cube in under 2 minutes","I speak three languages fluently","I can juggle five objects","I do calligraphy","I can beatbox","I know every country capital in the world","I can do a backflip","I make pottery","I play competitive chess","I bake sourdough from scratch","I draw hyperrealistic portraits","I do magic tricks","I can play four instruments","I've been doing stand-up comedy since I was 15","I memorize pi to 50 digits","I can identify almost any bird by its call","I repair vintage watches","I speed-type at 130 WPM","I do impressions of celebrities","I write poetry but never show anyone","I can whistle extremely loudly","I'm a certified scuba diver","I make my own hot sauce","I fold origami cranes while watching TV","I was in a viral TikTok and I'm not telling you which one","I play the theremin","I do competitive jigsaw puzzles","I knit while listening to lectures","I've memorized the NATO phonetic alphabet","I can hold my breath for 3 minutes","I moonlight as a wedding DJ","I trained a dog to do 40+ tricks","I'm a ranked competitive Scrabble player","I make short films on weekends","I play piano but only when no one is listening","I built my own PC at age 12","I can parallel park on the first try every time","I grow my own vegetables","I can draw most countries from memory","I've read over 200 books in the last three years","I can fall asleep in under 3 minutes anywhere","I won a regional math competition in middle school","I taught English abroad last summer","I can name every Pokémon from the original 151","I learned to code at age 10","I was a competitive fencer for 6 years","I make and sell my own candles","I speak conversational Japanese from watching anime","I can do a one-handed cartwheel","I repair old furniture and resell it","I'm a licensed drone pilot","I compete in pub trivia leagues","I paint murals on weekends","I built a website at 13 that got 10k monthly visitors","I play cello but it doesn't feel like a talent it's just a thing I do","I make beats on GarageBand","I competed nationally in debate","I can ice skate backwards","I'm a certified yoga instructor","I do archery","I can name every country by its flag","I know Morse code","I've been doing robotics since 7th grade","I make my own jewelry","I've done two half marathons","I paint watercolors I've never shown anyone","I can do mental math very fast","I can read upside-down text easily","I do improv comedy","I can identify designers by their fonts","I taught myself lockpicking","I collect vintage sneakers","I've been a volunteer EMT since I was 16","I can type without looking at the keyboard","I have never lost at Mario Kart","I secretly love doing taxes","I learned to drive a manual car before an automatic","I have a photographic memory for song lyrics","I can fall asleep on any flight no matter how short"];

  const questionList = ["Will AI make my degree worthless before I even graduate?","How do you use AI in your own classes?","Should I be scared of AI or excited about it?","Is it cheating to use ChatGPT on assignments?","How is Babson different from other business schools when it comes to AI?","What's The Generator and how do I get involved?","Do professors actually use AI themselves or just tell us not to?","What's the most useful thing AI can do for a college student?","Will AI replace strategy consultants?","How do you know when AI is wrong?","What majors are most protected from AI disruption?","Can AI help me write better or does it just write for me?","Do you think AI will change what it means to get a business degree?","What tools do you actually recommend students use?","Is there an AI policy at Babson?","How do I use AI without losing my own voice as a writer?","Will companies even care if I know how to use AI?","What's the difference between using AI as a tool vs. depending on it?","What's one thing AI cannot do that humans can?","How has AI changed the way you teach?","Do you think AI is overhyped?","What should I learn in college that AI can't learn for me?","Will AI get better at predicting the future than humans?","How do I become someone who uses AI well instead of badly?","Is AI going to change what business strategy means?","Can AI help with starting a business in FME?","What's the most important skill to develop alongside AI?","Do you think AI is good for creativity or bad for it?","How do you use AI for research without plagiarizing?","What's an example of a time AI surprised you?","Should I learn to code even if I'm a business major?","What do employers think about students who use AI?","Will AI make it easier or harder to start a business?","How do you teach critical thinking when AI can answer everything?","What's the best way to learn prompt engineering?","Can AI help me figure out what career I want?","How do I know if AI output is actually good quality?","What's your biggest worry about students using AI?","Is AI going to make internships more competitive?","How has AI changed how you grade?","Can AI help with group projects?","What's the most common mistake students make with AI?","Is there a version of AI use that's always okay vs. never okay?","Do you think AI will change what entrepreneurship looks like?","How do you stay current on AI when it changes so fast?","What should I know about AI before I start college?","Will AI be able to teach college courses?","How do you feel about students using AI on exams?","What's the most interesting AI tool you've used recently?","Can AI help with networking and career stuff?","Do you think future leaders need to understand AI?","How do you use AI in your writing process?","What's the difference between AI making you smarter vs. making you lazy?","Is AI going to make it harder or easier to get a job after graduation?","What do you wish you knew about AI 5 years ago?","How do I avoid becoming dependent on AI?","What's the best AI tool for business students right now?","Can AI help me understand financial statements?","How should I think about AI as a first-gen college student?","Do you think AI will change the Babson curriculum?","How do I use AI to practice for interviews?","Will AI change what it means to be a good writer?","Can AI help me choose my concentration?","How do you use AI to prepare for class?","What's one AI tool every college student should know?","Do you think AI is more useful for creative work or analytical work?","How do you make sure students are still learning when AI can do the work?","Can AI help with studying for exams?","How do I know when to trust AI and when to verify it?","What's the relationship between AI and entrepreneurship at Babson?","Do you worry that AI will make students less curious?","How do you use AI to give feedback on student writing?","What's the most common misconception about AI you hear from students?","Is AI better at strategy than humans yet?","How do I develop my own judgment when AI is always available?","What does it mean to be AI literate?","Can AI help with public speaking?","Do you think AI makes business more ethical or less ethical?","How is AI changing the finance industry?","What's the hardest part of using AI responsibly?","Can AI help me with the FME course?","How do you balance using AI with developing your own skills?","What's one thing AI is genuinely terrible at?","Can I use AI to help me write my college papers?","How do you think about AI and originality?","Will AI change how companies are organized?","Do you use AI for your own research?","How do I get good at AI without a technical background?","What's the most exciting thing happening in AI right now?","Do you think students should take AI ethics courses?","Can AI help with marketing for a small business?","How do you handle it when a student submits AI-written work?","How do I use AI to accelerate my learning without replacing it?","What questions should I be asking about AI that I'm not asking?","Is there a community at Babson for students who are really into AI?","How do you teach strategy differently because of AI?","What's the most surprising thing AI has taught you about your own field?","What's the right mindset for a student entering college right now?","Is coding still worth learning for business students?","Do you think AI will make human creativity more or less valuable?","What's one way AI has made your job harder?","How do you think about AI and academic integrity?","Do you think the hype around AI is justified?","What do I need to know about AI to be competitive when I graduate?","Do you think AI will change what leadership means?","Can AI help me write a business plan?","What's the most interesting AI use case you've seen from students?","How do you stay skeptical about AI without falling behind?","What's one thing about AI that you think is genuinely scary?","How do I know if I'm using AI as a crutch?","What's the most important question about AI that nobody is asking?","Do you think AI will change what it means to be educated?","How do you teach writing in an age when AI can write?","Can AI help me figure out whether my business idea is good?","Do you think AI makes students more or less confident?","How has AI changed what employers want from Babson graduates?","What's the best way to practice using AI so I get good at it?","Can AI help with time management?","What's one thing you'd tell an incoming student about AI that nobody else will tell them?","What's the most underrated AI tool for college students?","How do you use AI to develop better questions, not just answers?","Do you think AI will change the startup ecosystem?","How do I use AI to learn something I'm struggling with?","What's the most human thing about the way you teach?","What's the best way to stay current on AI as a non-technical person?","Do you think students who are good at using AI have an unfair advantage?","What's your favorite example of AI being used in a creative way?","How does AI fit into the Babson entrepreneurial mindset?","What's the most important thing to understand about how AI actually works?","What's one AI skill that will still matter in 20 years?","Do you think AI will change what kinds of people succeed in business?","How do you use AI to help you make better decisions?","What's the weirdest way you've used AI?","Do you think AI is going to be net positive or net negative for society?","What's the most misunderstood thing about AI?","How do you keep students from just copying AI output?","Can AI help me figure out what I want to do with my life?","How do you use AI to save time without cutting corners?","What's something AI can do that still amazes you?","Can AI help me write better emails and professional communications?","What's the difference between AI and automation?","How has AI changed what it means to do good research?","What's one thing you'd tell us to stop worrying about when it comes to AI?","How do you use AI to get unstuck when you're working on something hard?","How do you think about AI and privacy?","What's one thing about AI that gives you genuine hope?","How do you teach students to be critical of AI output?","What's the most important question to ask before using AI for any task?","What's the relationship between AI and the kind of thinking Babson tries to develop?","Do you think AI will make college more or less important?","What's something you've changed your mind about regarding AI?","How do you use AI as a sparring partner for your own ideas?","What's the single most useful thing I could do with AI in my first semester?","How do you think about AI and the things that make us human?","Is there anything about how Babson handles AI that you're especially proud of?","Will AI change what it means to be an entrepreneur?","What advice would you give a student who is afraid of being left behind on AI?","How do you make sure your own thinking doesn't get replaced by AI?","What's one thing AI does poorly that I might not expect?","What's the most important habit to develop around AI use?","What's the biggest gap between how AI is portrayed in the media and what it actually is?","Do you think students who grow up with AI will think differently than those who didn't?","How do you think about the relationship between AI and human judgment?","Do you think AI will change what makes a great college experience?","What's the first thing I should do with AI when I get to Babson?"];

  session.careers = careerPicks;
  session.talents = talentList;
  questionList.forEach(text => {
    session.questions.push({ id: session.nextId++, text, timestamp: Date.now() });
  });

  res.json({ ok: true, loaded: { careers: session.careers.length, talents: session.talents.length, questions: session.questions.length } });
});

// ─── Synthesis: Act 1 ────────────────────────────────────────────────────────

app.post('/api/admin/synthesize/act1', async (req, res) => {
  if (!checkPin(req, res)) return;
  if (session.synthesizing.act1) return res.status(409).json({ error: 'Already synthesizing' });

  session.synthesizing.act1 = true;
  try {
    const dist = careerDistribution().slice(0, 10)
      .map(({ career, count }) => `${career}: ${count}`).join(', ');
    const talents = session.talents.join('\n');

    const prompt = `You are helping two college professors do a quick, fun reveal at an admitted student day for incoming college students.

Here is what the room submitted:

Age-8 career dreams (most common picks): ${dist}
Hidden talents (all responses):
${talents}

Write exactly two things:

1. One punchy sentence reacting to the career distribution — something specific and a little funny. Reference actual numbers if interesting.

2. One short paragraph (3-4 sentences) that synthesizes the hidden talents into a portrait of who is in this room. Be warm and specific. Find the surprising thing underneath the obvious ones. The last sentence should be the one that makes the room go quiet.

Return as JSON with no extra text:
{"career_line":"...","talent_portrait":"..."}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text.trim();
    const json = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    session.act1Result = JSON.parse(json);
    res.json({ ok: true, result: session.act1Result });
  } catch (err) {
    console.error('Act 1 synthesis error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    session.synthesizing.act1 = false;
  }
});

// ─── Synthesis: Act 2 ────────────────────────────────────────────────────────

app.post('/api/admin/synthesize/act2', async (req, res) => {
  if (!checkPin(req, res)) return;
  if (session.synthesizing.act2) return res.status(409).json({ error: 'Already synthesizing' });

  session.synthesizing.act2 = true;
  try {
    const questions = session.questions.map((q, i) => `${i + 1}. ${q.text}`).join('\n');

    const prompt = `You are helping two college professors analyze questions from a room of admitted college students at an admitted student day. The professors teach Strategy and Writing/English at a business college and lead a co-curricular AI program called The Generator.

Here are all submitted questions:
${questions}

Please do the following:

1. GROUP the questions into 3-4 thematic clusters. Give each cluster a short label (3-6 words) and a count.

2. SYNTHESIZE one "meta question" — the single question that, if answered well, speaks to the most people in the room, including those who didn't know how to phrase what they were feeling. Specific enough to answer in 10 minutes, broad enough to touch multiple themes.

3. SURFACE one "outlier question" — too specific or too different to fit, but worth noting.

Return ONLY valid JSON with no extra text:
{"clusters":[{"label":"...","count":N,"example_question":"..."}],"meta_question":"...","meta_question_rationale":"...","outlier_question":"...","outlier_note":"..."}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text.trim();
    const json = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    session.act2Result = JSON.parse(json);
    res.json({ ok: true, result: session.act2Result });
  } catch (err) {
    console.error('Act 2 synthesis error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    session.synthesizing.act2 = false;
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🎓 Collective Question running at http://localhost:${PORT}`);
  console.log(`   Submit: http://localhost:${PORT}/submit`);
  console.log(`   Admin:  http://localhost:${PORT}/admin  (PIN: ${ADMIN_PIN})`);
  console.log(`   Display: http://localhost:${PORT}/display\n`);
});
