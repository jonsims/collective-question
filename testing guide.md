# Testing Guide

**Public URL:** `https://friendship-nitrogen-given-annotation.trycloudflare.com`
**Local URL:** `http://localhost:3000`

---

## The Three Pages

| Page | URL |
|------|-----|
| Submit (student-facing) | `/submit` |
| Admin (you) | `/admin` — PIN: `1234` |
| Display (projector) | `/display` |

---

## Step-by-Step Test

**1. Open three browser tabs:**
- Tab 1: `/admin`
- Tab 2: `/display`
- Tab 3: `/submit` (or scan the QR code shown on the display tab)

**2. In Admin — load test data:**
- Enter PIN `1234`
- Click **Load Test Data** — populates 80 careers, 80 talents, 200 questions instantly
- You should see the counts update

**3. In Admin — test the display controls:**
- Click **📱 QR / Collection** → display tab shows QR code and counter
- Click **📊 Career Chart** → display tab shows bar chart of age-8 careers
- (The other states need synthesis first — do those next)

**4. In Admin — synthesize Act 1:**
- Click **Synthesize Act 1**
- Wait ~10 seconds for Claude to respond
- You'll see a career one-liner and a talent portrait appear in the admin panel
- Click **✨ Act 1 Synthesis** → display tab shows the results

**5. In Admin — synthesize Act 2:**
- Click **Synthesize Act 2**
- Wait ~15 seconds
- You'll see clusters, a meta question, and an outlier appear
- Step through: **💬 Raw Questions** → **🗂 Clusters** → **🎯 Meta Question** → **🔍 Outlier**

**6. Test a real submission:**
- Go to the submit tab (or scan the QR code from your phone)
- Fill out all three questions and hit Submit
- Watch the counter increment on the display tab

**7. Test Reset:**
- Click **Reset Session** in admin to clear everything and start fresh

---

## If Synthesis Fails
- Check that the `.env` file has a valid `ANTHROPIC_API_KEY`
- Click **↺ Try Again** — a failed synthesis is actually a useful demo moment

## If the Tunnel Goes Down
The Cloudflare Quick Tunnel dies if the laptop sleeps. Restart it:
```bash
/tmp/cloudflared tunnel --url http://localhost:3000 --no-autoupdate &
```
A new URL will be generated — check the terminal output for it.

## Restarting the Server
```bash
pkill -f "node server.js"
cd "/Users/jonsims/Desktop/Working drafts/Launch Babson/collective-question"
npm start
```
