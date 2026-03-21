# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A live event app for Babson College's "Launch Babson" admitted student day (Class of 2030). Two professors — Jonathan (Strategy) and Kristi (Writing/English) — run a 50-minute session called "The Collective Question" twice back-to-back in Winn Auditorium with 100+ students per session.

Students scan a QR code, answer 3 questions (~30 sec), and AI synthesizes their responses in real time on a projector. The professors predict what the AI will say before each reveal, creating a "faculty vs. AI" moment.

## Commands

```bash
npm start          # Run server (port 3000)
npm run dev        # Run with --watch for auto-reload
```

## Deployment

- **Production:** Deployed on Render (auto-deploys on push to `master`)
- **Render service:** `collective-question` — free tier, spins down after 15 min idle
- **GitHub repo:** github.com/jonsims/collective-question
- **Local tunnel (backup):** `cloudflared tunnel --url http://localhost:3000 --no-autoupdate`

## Environment

Requires `.env` with: `ANTHROPIC_API_KEY`, `ADMIN_PIN` (default: 1234), `PORT` (default: 3000).

On Render, these are set as environment variables in the dashboard.

## Architecture

**Single-file Express server** (`server.js`) with all state in memory. No database — data resets on restart.

**Three pages served as static HTML from `public/`:**
- `submit.html` — mobile-first form with searchable career datalist, talent text, question text. Inline error handling, 10s fetch timeout, double-submit prevention.
- `admin.html` — light-themed control panel with PIN gate. Layout top-to-bottom: projector controls + live preview (iframe), live response stats, AI generation button, career/talent data, questions list, danger zone.
- `display.html` — full-screen projector view with 7 visual states, polls `/api/state` every 2 seconds, 5s fetch timeout. All text minimum 1.5rem for 50+ foot readability.

**AI synthesis via Claude API (`claude-sonnet-4-6`):**
- Single "Generate All" button runs both in parallel via `Promise.allSettled`
- **Act 1** — career one-liner + talent portrait (500 tokens, <25/<80 words)
- **Act 2** — question clustering (3-4 themes), meta-question (<20 words), outlier (800 tokens)
- Robust JSON parsing: 3-strategy fallback (direct → strip fences → regex extract)
- 30s API timeout via `Promise.race`
- Actionable error messages (not raw SyntaxError)

**Key patterns:**
- Admin auth: PIN via `x-admin-pin` header. No session/JWT.
- Display coordination: Admin sets `displayState` via POST, display page picks it up on next poll.
- Valid states: `collection`, `career_chart`, `act1_synthesis`, `raw_questions`, `clusters`, `meta_question`, `outlier`
- Career whitelist: `VALID_CAREERS` Set — server rejects unlisted values
- Input limits: talent 200 chars, question 500 chars, max 500 submissions, 10kb body limit
- Between-session reset: `POST /api/admin/next-session` with `{ confirm: true }`
- Live preview: admin embeds `/display` in a scaled iframe (no extra server code)

## Key Constraints

- Runs for two back-to-back 50-minute sessions. Reliability > elegance.
- Display text readable from 50+ feet — minimum 1.5rem for supporting text.
- Must work on flaky auditorium Wi-Fi. No external CDN dependencies. QR code generated locally.
- Students fill out form in ~30 seconds while standing. Keep submission path minimal.
- Admin operates under pressure mid-presentation. Controls are descriptive, grouped by act, with a live projector preview. Destructive actions in a separate "Danger Zone."
- All fetch calls have AbortController timeouts (5s display, 8s admin, 10s submit).

## Files

```
server.js              — Express server, all routes, synthesis logic, test data
public/submit.html     — Student submission form (mobile)
public/admin.html      — Presenter control panel (light mode, with projector preview)
public/display.html    — Projector display (7 states, full-screen)
Quick Start Guide.md   — How to run the app for the event
quick description.md   — Proposal to share with Kristi
.env                   — API key + PIN (gitignored)
```
