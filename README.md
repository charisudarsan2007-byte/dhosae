# dhosae

> **Live each day as if it were your last.**
> A personal journal kept one day at a time. Each entry is a single day,
> written as if it might be the last one — [dhosae.in](https://dhosae.in).

Built with **[Astro](https://astro.build)** (server-rendered). Warm, quiet,
almost no client JS (a tiny scroll-reveal and the live clock are all that ship).
Days live in a database and are written through a private, password-gated
**/studio** — see **[DEPLOY.md](DEPLOY.md)** to put it on dhosae.in.

---

## The idea (read this before changing anything)

dhosae takes its spine from Steve Jobs's 2005 Stanford address: *if today were
the last day of my life, would I want to do what I am about to do today?* The
site is built to feel like that question:

- **Time is the subject.** The homepage opens on **Today** — the live date and
  time, ticking. Every entry is stamped with the day **and the hour** it was
  written (all in IST, Asia/Kolkata).
- **It is personal and singular** — it speaks as *I*, never "we".
- **Warm, not clinical.** A near-white paper canvas, ink that reads like it was
  set on paper, days written in a reading serif like letters.
- **No feed, no follower count, no subscribe box.** Come back tomorrow, or don't.

If a future change turns this into a content marketing machine — counters,
capture forms, social walls — it is working *against* the brief. Don't.

---

## Run it

```bash
npm install      # once
npm run dev      # local dev → http://localhost:4321
npm run build    # production build → ./dist
npm run preview  # preview the production build
```

Node 18+ required. On first run the app creates its tables and seeds a single
opening entry; visiting `/studio` walks you through setting a password.

---

## The design system

Everything visual is governed by tokens in **`src/styles/tokens.css`** — change
the mood there and the whole site follows.

**Canvas:** a warm near-white (`--paper: #fbfaf6`).

**Accent palette** (the only permitted colours): violet leads; black, red,
green, blue are reserved punctuation.

| Token      | Use                                                            |
| ---------- | -------------------------------------------------------------- |
| `--violet` | **The one voice that speaks** — dates, the sun, links, the mark |
| `--ink`    | A warm near-black — the writing itself                         |
| `--red`    | Held back: destructive actions, errors                         |
| `--green`  | Held back: a saved/confirmed state                             |
| `--blue`   | Held back: rare data accents                                   |

> Colour is never decoration here. If you reach for it, ask what it *means*.

**Type:** Fraunces (serif — display *and* the reading body) · Inter (chrome &
forms) · JetBrains Mono (the clock and every timestamp). All self-hosted via
`@fontsource-variable`, no external requests.

**The mark — "the loop that won't close":** `src/components/Wordmark.astro` (and
`public/favicon.svg`). A single one-stroke ring that refuses to close. The form
*is* the idea: a thing that won't be contained.

**The divider — "first light":** `src/components/HeroArt.astro` — one horizon and
a sun just clearing it. The theme in a single line: a day beginning, and the
quiet knowledge that it ends. Drawn from scratch; nothing sourced from the web.

---

## Project structure

```
src/
  components/        Nav, Footer, HeroArt (first light), Wordmark
    studio/PostForm  the write/edit form (title · line · date-time · body)
  layouts/
    Base.astro       public <head>, nav, footer, scroll-reveal
    Studio.astro     the private studio shell
  lib/
    db.ts            libSQL data layer — posts, the note, admin (+ the seed)
    auth.ts          scrypt password + HMAC-signed session cookie
    format.ts        IST date/time formatting + datetime-local <-> ISO
  middleware.ts      guards /studio (setup → login → in)
  pages/
    index.astro      Today (live clock) · the days · the standing note
    posts/[slug]     a single day, read in serif
    studio/          setup · login · the days · new · edit · the note · logout
  styles/            tokens.css (the mood) + global.css
public/              favicon
```

## Writing a day

Go to `/studio` → **Write today**. A title, an optional line beneath it, the
date & time (filled to now, editable), and the day itself in Markdown. Reading
time is computed for you. Untick *draft* and it's live — no rebuild, no commit.

Local writing lives in `dhosae.db` (gitignored). Production writing lives in
your Turso database. They never mix.

---

_© dhosae — one day at a time._
