# Quick Start Guide — The Collective Question

## What This Is

A live audience participation app for Launch Babson. Students scan a QR code, answer 3 quick questions, and AI synthesizes their responses in real time on the projector. You control everything from an admin panel on your laptop.

---

## The Three Pages

| Page | Who Uses It | What It Does |
|------|------------|--------------|
| **/submit** | Students (on their phones) | 3-question form: age-8 career, hidden talent, question for you |
| **/admin** | You (on your laptop) | Control panel — trigger synthesis, switch display states |
| **/display** | Projector | Full-screen view that updates based on your admin controls |

> **Students never type the URL** — they scan the QR code on the projector, which takes them straight to `/submit`. The URL is also displayed as text below the QR code as a fallback.
>
> For your own use, just bookmark the local links:
> - Admin: [localhost:3000/admin](http://localhost:3000/admin)
> - Display: [localhost:3000/display](http://localhost:3000/display)

---

## Before the Event

### 1. Start the server
Open Terminal, navigate to the project folder, and run:
```bash
cd "/Users/jonsims/Desktop/Working drafts/Launch Babson/collective-question"
npm start
```

### 2. Make it publicly accessible
In a second Terminal tab, start a Cloudflare tunnel:
```bash
cloudflared tunnel --url http://localhost:3000 --no-autoupdate
```
Look for the line that says `Your quick Tunnel has been created! Visit it at:` — that's the public URL. You don't need to copy it anywhere — the QR code on the display page detects and uses it automatically.

### 3. Open the admin and display pages
- **On your laptop:** Open [localhost:3000/admin](http://localhost:3000/admin) — enter PIN `1234`
- **On the projector:** Open [localhost:3000/display](http://localhost:3000/display) — full screen it (Cmd+Shift+F in Chrome)
  - If the projector is a separate computer, use the public tunnel URL + `/display` instead

### 4. Test it
In the admin panel, scroll to the bottom and click **Load Test Data**. Then try:
- Click **Generate All AI Content** — wait ~15-20 seconds — you should see career one-liner, talent portrait, clusters, and a meta question
- Step through the display states using the buttons — watch the projector page change

When done testing, click **Next Session** → **Yes, reset for next session** to clear test data.

---

## During the Session

### The Flow

| Step | What You Do | What Students See |
|------|------------|-------------------|
| **1. Collection** | Display starts on QR screen automatically | Students scan QR code, fill out 3 questions (~30 sec) |
| **2. Kristi's exercise** | Watch the submission counter climb | They're submitting while Kristi runs her prediction exercise |
| **3. Career Chart** | Click **Career Chart** in admin | Bar chart of what everyone wanted to be at age 8 |
| **4. Synthesize Act 1** | Click **Synthesize Act 1**, wait for result | Nothing yet (they watch you) |
| **5. Act 1 Reveal** | Click **Act 1 Synthesis** | Career one-liner + talent portrait appear on screen |
| **6. React together** | You and Kristi discuss the portrait | — |
| **7. Raw Questions** | Click **Raw Questions** | Their questions scroll on screen |
| **8. Synthesize Act 2** | Click **Synthesize Act 2**, wait for result | Nothing yet |
| **9. Clusters** | Click **Clusters** | Themed groups with counts |
| **10. Meta Question** | Click **Meta Question** | The one synthesized question appears |
| **11. Answer it** | You and Kristi answer, unrehearsed | — |
| **12. Outlier** | Click **Outlier** | One question that didn't fit but was interesting |

### Between Sessions

Click the green **Next Session** button at the top of the admin panel. It asks "Are you sure?" — click **Yes, reset for next session**. Everything clears and the display returns to the QR code. Ready for the next group.

---

## Admin Panel At a Glance

- **Green dot** (top left) = connected to server. Red = connection lost.
- **Stats row** = live count of submissions, talents, questions.
- **Readiness text** below each Synthesize button tells you if you have enough data (need at least 5).
- **Display buttons** are grouped into Act 1 and Act 2 so you know the sequence.
- **"Now showing"** banner tells you what the projector is currently displaying.
- **Red errors** below synthesis buttons = something went wrong. Usually just click again.

---

## If Something Goes Wrong

| Problem | Fix |
|---------|-----|
| Synthesis fails | Error message appears below the button. Click the button again. If it fails twice, it's likely an API issue — skip that section and move on. |
| Display is blank | Check the "Now showing" banner in admin. You may have switched to a state that hasn't been synthesized yet — switch back. |
| QR code doesn't scan | Students can type the URL shown below the QR code on the projector. |
| Server crashes | In Terminal: `npm start` to restart. You'll need to re-collect submissions. |
| Tunnel dies (laptop slept) | Run the `cloudflared tunnel` command again. A new URL will be generated — update the display page. |
| Admin shows red dot | Server or network issue. Wait a few seconds — it auto-reconnects. If it persists, refresh the admin page. |

---

## Key Details

- **Admin PIN:** `1234` (set in `.env` file — change before the event if needed)
- **Local URL:** [http://localhost:3000](http://localhost:3000)
- **GitHub repo:** [github.com/jonsims/collective-question](https://github.com/jonsims/collective-question)
- **API:** Uses Claude (Anthropic) for synthesis. Key is in the `.env` file.
- **Data:** Everything lives in memory. Restarting the server clears all data.
- **Public URL:** Generated fresh each time you start the tunnel. Students don't need to know it — they scan the QR code.
