# AI Activity Log — The Collective Question

## 2026-04-02 — Initial build session

**Files reviewed:** All source files (server.js, submit.html, admin.html, display.html, package.json, .env, Quick Start Guide.md, testing guide.md)

**Work completed this session:**
- Designed the "Collective Question" activity concept through iterative brainstorming (started with 10 ideas, refined to final 3-question / 2-act structure)
- Built the full app from scratch: server.js, 3 HTML pages, test data (80 careers, 80 talents, 200 questions)
- Fixed synthesis failure (trailing period on API key)
- Ran multi-agent code reviews (code reviewer, UI expert, 2 professors, 5 student personas) — identified ~20 issues
- Hardened for live event: fetch timeouts, robust JSON parsing, input validation, career whitelist, actionable errors, empty state placeholders, between-session reset
- Redesigned admin from dark to light mode with descriptive labels
- Combined separate Act 1/Act 2 synthesis into single "Generate All" button
- Added live projector thumbnail preview to admin (iframe-based, zero server changes)
- Reorganized admin layout: projector controls at top, then stats, then AI generation, then data
- Deployed to Render (auto-deploy on push to master)
- Wrote Quick Start Guide, testing guide, CLAUDE.md, proposal for Kristi (quick description.md)
- Saved project memory for future sessions

**Files updated:**
- CLAUDE.md — full rewrite reflecting current architecture
- Quick Start Guide.md — updated to match new "Generate All" button
- testing guide.md — updated to match current UI and deployment
- AI_LOG.md — created

**Known issues / not yet done:**
- Title + description for Hannah's program booklet (was due 3/20 — may be overdue)
- Kristi hasn't seen the proposal yet (quick description.md is ready to send)
- Hannah suggested incorporating current Babson students — not yet planned
- Render free tier spins down after 15 min idle — need to wake it ~5 min before the event
- API key was visible in a terminal screenshot — should be rotated at console.anthropic.com

**Recommended next actions:**
1. Send proposal to Kristi (quick description.md or the email draft)
2. Submit title + description to Hannah
3. Test full flow on Render with real API key
4. Do a dry run on the actual projector in Winn Auditorium to check font sizes
5. Rotate the Anthropic API key

---

## 2026-04-08 — Major feature additions for Friday's event

**Files reviewed:** server.js, all 3 HTML pages, package.json, .env

**Work completed this session:**
- Added 2 new questions to submit form: "Where are you from?" (US state or country) and "Favorite food?"
- Created `locations.js` with 165 US states + countries (with lat/lng centroids for map plotting)
- Added `/api/locations` endpoint serving the location whitelist for the form datalist
- Server now validates locations against the whitelist (same pattern as careers)
- Added `world_map` display state with 3D interactive globe (globe.gl) + SVG world map fallback
- Vendored globe.gl (1.7MB) + earth-night.jpg (698KB) into `public/lib/` — no CDN dependencies
- Globe shows points sized/elevated by location count, auto-rotates, atmosphere glow
- Added `recipe` display state — full-page parchment-styled recipe card
- Added Recipe synthesis endpoint: Claude generates an absurd, ambitious recipe using students' favorite foods. Returns name, tagline, ingredients, steps, tasting note, foods_used count.
- Updated admin panel: new stats (locations, foods), location chart, foods list, AI Recipe panel with separate Generate button, new display buttons for World Map and Recipe
- Updated test data with 118 locations (Massachusetts-heavy, with international representation) and 91 foods
- Created `render.yaml` blueprint for one-click Render deployment

**Reliability work:**
- Load-tested 150 concurrent submissions: 100% success, 31ms total, 16ms avg latency, max 24ms
- Server confirmed to handle 100+ concurrent users with no issues
- All synthesis features tested end-to-end with real Claude API: Act 1 (~8s), Act 2 (~8s parallel), Recipe (~14s)

**Files updated:**
- server.js — locations, foods, recipe synthesis, updated test data
- public/submit.html — 5 questions, location datalist loaded from API
- public/display.html — world_map and recipe screens, globe.gl integration
- public/admin.html — new stats, charts, recipe panel, world_map button
- locations.js — created, 165 entries
- public/lib/globe.gl.min.js + earth-night.jpg — vendored
- render.yaml — created for Render deployment
- CLAUDE.md — updated to reflect 5-question form, new display states, vendored libs

**Known issues / not yet done:**
- The Render service may not actually exist yet (collective-question.onrender.com returns 404). Jonathan needs to verify in dashboard.render.com and either create the service or share the actual URL.
- The Cloudflare tunnel was running on a previous local server but isn't currently active.
- No live verification on Render yet — only verified locally.
- The .env file has been edited (likely to add the rotated API key, per the previous session's recommendation).

**Recommended next actions for next session:**
1. Verify Render deployment URL — create the service if needed (use render.yaml blueprint)
2. Test the live deployment URL to make sure all routes work
3. Wake the Render dyno ~5 min before the actual event Friday
4. Do a dry run on the projector in Winn Auditorium — verify globe renders, fonts are readable
5. Update Quick Start Guide and testing guide to reflect the 5-question form and new world_map/recipe states

---

## 2026-04-10 — Day-of polish for the Launch Babson event

**Files reviewed:** public/display.html, public/admin.html, server.js, production state on Render

**Work completed this session:**
- Confirmed Render service IS deployed at https://collective-question.onrender.com — all routes return 200
- Ran full production smoke test: page routes, static assets, API endpoints, auth, 100 concurrent submissions (100% success, 177ms avg), all three synthesis endpoints in parallel (Act 1 ~8s, Act 2 ~8s, Recipe ~14s)
- Switched globe from night (dark) to day texture on white background — earth-day.jpg (239KB) vendored locally. Red dots with white stroke, green atmosphere glow.
- Added new display state `world_map_svg` — flat equirectangular map using CSS background-image + SVG dot overlay (maximum browser compatibility). Now accessible as a separate admin button ("Flat Map") alongside "3D Globe".
- Fixed init race condition on globe: location data cached in `lastLocationPoints`, applied after `initGlobe()` completes. `pointsData()` now always pushed on poll when globeReady, not just on data change. Wait for `window.load` before init with 300ms delay.
- Rewrote flat map rendering: original SVG `<image>` embed had spotty PC browser support (older Edge rendered blank). Replaced with CSS `background-image: url('/lib/earth-day.jpg')` on a positioned div + absolute-positioned SVG overlay for dots. Both layers use matching aspect-ratio fitting so dots align.
- Fixed loading overlay text: used to say "Reading 250 responses" which summed careers + questions (double-counting). Now says "Reviewing submissions..." with animated dots, no count.
- Added node engine spec (implicit via render.yaml, NODE_VERSION: "22").

**Files updated:**
- public/display.html — flat map rewrite, globe white/day mode, loading overlay text, init race fix
- public/admin.html — new "3D Globe" + "Flat Map" buttons in Act 1 section, STATE_LABELS updated
- server.js — added `world_map_svg` to valid display states whitelist
- CLAUDE.md — updated vendored files, display state count (9 → 10), world map description
- public/lib/earth-day.jpg — added (239KB)

**Commits (this session):**
- 7c859ce Add Flat Map display + switch globe to day mode on white background
- 8108f72 Fix: globe points not appearing after init race condition
- 138756c Fix: flat map not rendering on PC browsers
- 78a5f7a Fix: loading overlay says 'Reviewing submissions' instead of inflated count

**Known issues / not yet done:**
- earth-night.jpg is still in `public/lib/` but unused — can be removed to save 698KB on deploy (non-urgent)
- No documented minimum Node version in package.json (specified only via render.yaml NODE_VERSION)
- No automated tests — manual smoke tests only

**Recommended next actions for next session:**
1. After the event, remove unused earth-night.jpg to slim the repo
2. Rotate the ANTHROPIC_API_KEY (has been visible in terminal screenshots)
3. Consider adding a minimal health check endpoint (currently `/api/state` serves this purpose)
4. Post-event: archive the repo or reset test data for reuse in future events
5. Document what went well/poorly during the actual event for the next iteration
