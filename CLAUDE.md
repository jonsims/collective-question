# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A live event app for Babson College's "Launch Babson" admitted student day. Two professors (Jonathan/Strategy, Kristi/Writing) run a session called "The Collective Question" where students submit responses via QR code, and AI synthesizes them in real time on a projector.

Three coordinated interfaces: `/submit` (student phones), `/admin` (presenter laptop), `/display` (projector).

## Commands

```bash
npm start          # Run server (port 3000)
npm run dev        # Run with --watch for auto-reload
```

## Environment

Requires `.env` with: `ANTHROPIC_API_KEY`, `ADMIN_PIN` (default: 1234), `PORT` (default: 3000).

## Architecture

**Single-file Express server** (`server.js`) with all state in memory. No database — data lives only for the duration of the session and resets on restart.

**Three page types served as static HTML from `public/`:**
- `submit.html` — mobile-first form (career dropdown, talent text, question text)
- `admin.html` — dark-themed control panel with PIN gate, live stats, synthesis triggers, display state buttons
- `display.html` — full-screen projector view with 7 visual states, polls `/api/state` every 2 seconds

**Two synthesis operations via Claude API (`claude-sonnet-4-6`):**
- **Act 1** — career distribution one-liner + talent portrait paragraph (500 tokens)
- **Act 2** — question clustering, meta-question synthesis, outlier selection (800 tokens)

Both return JSON. The prompts instruct Claude to return only valid JSON. Parsing strips code fences as a fallback.

**Admin auth:** PIN sent via `x-admin-pin` header on all admin API calls. No session/JWT.

**Display coordination:** Admin sets `displayState` via POST, display page picks it up on next poll cycle. Valid states: `collection`, `career_chart`, `act1_synthesis`, `raw_questions`, `clusters`, `meta_question`, `outlier`.

**QR code:** Generated server-side via `qrcode` package at `/api/qr` — no external API dependency.

## Key Constraints

- This runs once for a live 50-minute event in an auditorium. Reliability > elegance.
- Display text must be readable from 50+ feet — minimum 2rem for body copy on display.html.
- The app must work on flaky auditorium Wi-Fi. No external CDN dependencies in the HTML pages.
- Students fill out the form in ~30 seconds while standing. Keep the submission path minimal.
- The admin operates under pressure mid-presentation. Controls must be unambiguous and hard to misclick. Destructive actions (reset, load test data) are in a separate "Danger Zone."
