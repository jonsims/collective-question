# Quick Start Guide — The Collective Question

## What This Is

A live audience participation app for Launch Babson. Students scan a QR code, answer 5 quick questions, and AI synthesizes their responses in real time on the projector. You control everything from an admin panel on your laptop.

---

## The Three Pages

| Page | Who Uses It | What It Does |
|------|------------|--------------|
| **/submit** | Students (on their phones) | 5-question form: age-8 career, location, talent, favorite food, question |
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
- Click **Generate Recipe** — wait ~15 seconds — you'll get an absurd AI-invented recipe from the foods
- Step through the display states using the buttons — watch the projector page change
- Try the **World Map** button — you should see a 3D globe with green dots where students are from

When done testing, click **Next Session** → **Yes, reset for next session** to clear test data.

---

## During the Session

### The Flow

| Step | What You Do | What Students See |
|------|------------|-------------------|
| **1. Collection** | Display starts on QR screen automatically | Students scan QR code, fill out 5 questions (~45 sec) |
| **2. Kristi's exercise** | Watch the submission counter climb | They're submitting while Kristi runs her prediction exercise |
| **3. World Map** | Click **World Map** | 3D globe lights up with where everyone is from |
| **4. Career Chart** | Click **Career Chart** | Bar chart of what everyone wanted to be at age 8 |
| **5. Generate AI** | Click **Generate All AI Content**, wait ~15s | Nothing yet (they watch you) |
| **6. Portrait** | Click **Portrait** | Career one-liner + talent portrait appear |
| **7. React together** | You and Kristi discuss the portrait | — |
| **8. All Questions** | Click **All Questions** | Their questions scroll on screen |
| **9. Themes** | Click **Themes** | Question groups with counts |
| **10. The Question** | Click **The Question** | The one synthesized meta question appears |
| **11. Answer it** | You and Kristi answer, unrehearsed | — |
| **12. Surprise Q** | Click **Surprise Q** | One question that didn't fit but was interesting |
| **13. Bonus: Recipe** | (Optional) Click **Generate Recipe**, then **AI Recipe** | The AI's absurd recipe from their favorite foods |

### Between Sessions

Click the green **Next Session** button at the top of the admin panel. It asks "Are you sure?" — click **Yes, reset for next session**. Everything clears and the display returns to the QR code. Ready for the next group.

---

## Admin Panel At a Glance

- **Green dot** (top left) = connected to server. Red = connection lost.
- **Stats row** = live count of submissions, locations, talents, foods, questions.
- **Readiness text** below each generate button tells you if you have enough data (need at least 5).
- **Display buttons** are grouped into Act 1, Act 2, and Bonus.
- **"Now showing"** banner tells you what the projector is currently displaying.
- **Live preview** thumbnail on the right shows exactly what's on the projector.
- **Red errors** below generate buttons = something went wrong. Usually just click again.

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
