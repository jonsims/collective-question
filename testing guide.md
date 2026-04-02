# Testing Guide

**Local URL:** `http://localhost:3000`
**Deployed URL:** On Render (auto-deploys from GitHub)

---

## The Three Pages

| Page | URL |
|------|-----|
| Submit (student-facing) | `/submit` |
| Admin (you) | `/admin` — PIN: `1234` |
| Display (projector) | `/display` |

---

## Step-by-Step Test

**1. Open two browser tabs:**
- Tab 1: `/admin` (enter PIN `1234`)
- Tab 2: `/display` (or just watch the live preview thumbnail inside admin)

**2. In Admin — load test data:**
- Scroll to the bottom **Danger Zone**
- Click **Load Test Data** — populates 80 careers, 80 talents, 200 questions
- Stats row at top should show the counts

**3. In Admin — generate AI content:**
- Click **Generate All AI Content**
- Wait ~15-20 seconds for Claude to process
- You'll see career one-liner, talent portrait, clusters, meta question, and outlier appear in the results area

**4. In Admin — step through the display:**
- Click each button in order: **QR Code** → **Career Chart** → **Portrait** → **All Questions** → **Themes** → **The Question** → **Surprise Q**
- Watch the projector preview thumbnail (or the display tab) update with each click

**5. Test a real submission:**
- Open `/submit` on your phone (or a third browser tab)
- Fill out all three questions and hit Submit
- Watch the submission counter increment

**6. Test between-session reset:**
- Click **Next Session** at the top of admin
- Click **Yes, reset for next session** to confirm
- Everything clears, display returns to QR code

---

## If Synthesis Fails
- Check that `.env` has a valid `ANTHROPIC_API_KEY` (no trailing period!)
- Error messages appear below the Generate button — read them for hints
- Click the button again to retry

## If Running Locally with a Tunnel
```bash
cloudflared tunnel --url http://localhost:3000 --no-autoupdate
```
A new URL is generated each time — the QR code on the display page uses it automatically.

## Restarting the Server
```bash
pkill -f "node server.js"
cd "/Users/jonsims/Desktop/Working drafts/Launch Babson/collective-question"
npm start
```
