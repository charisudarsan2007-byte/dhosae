# dhosae

> **Big brain. Big stuff only.**
> Notes from one mind on the few things that move money, power and the world.
> The topics are deliberately undisclosed. Unorthodox on purpose — [dhosae.in](https://dhosae.in).

Built with **[Astro](https://astro.build)** (server-rendered). Content-first,
design-led, almost no client JS (only a tiny scroll-reveal script ships to the
browser). Writing lives in a database and is authored through a private,
password-gated **/studio** — see **[DEPLOY.md](DEPLOY.md)** to put it on dhosae.in.

---

## The idea (read this before changing anything)

dhosae is **personal and singular** — it speaks as *I*, never "we". It is
**unconventional in structure, not just in words**:

- **No public categories.** Topics are never labelled or advertised. A reader
  discovers what a piece is about by reading it. The index shows titles + dates
  only; the standfirst is revealed on hover.
- **No newsletter, no subscribe box, no email capture.** Those are the default
  moves of every blog. Gone on purpose.
- **No social links** (no X, no LinkedIn, no follow button).
- **No section menu.** The nav advertises nothing.

If a future change reintroduces categories, a subscribe form, or social links,
it is working *against* the brief. Don't.

---

## Run it

```bash
npm install      # once
npm run dev      # local dev → http://localhost:4321
npm run build    # production build → ./dist
npm run preview  # preview the production build
```

Node 18+ required (developed on Node 25).

---

## The design system

Everything visual is governed by tokens in **`src/styles/tokens.css`** — change
the brand there, the whole site follows.

**Canvas:** always white (`--paper`).

**Accent palette** (the only permitted colours): violet, green, red, blue, black.

| Token      | Use                                                            |
| ---------- | -------------------------------------------------------------- |
| `--violet` | **Primary brand** — the unorthodox signal. (Most sites in this space default to blue/green; leading with violet *is* the statement.) |
| `--green`  | Available for "up" / growth accents                            |
| `--red`    | Available for "down" / risk accents                           |
| `--blue`   | Available for data accents                                     |
| `--black`  | Editorial ink + the full-bleed creed band                     |

> Note: green/red/blue exist in the system for use *inside* a piece (charts,
> emphasis). They are **not** used as category colours on the homepage —
> there are no categories.

**Type:** Fraunces (display serif) · Inter (UI/body) · JetBrains Mono (numbers &
meta). All self-hosted via `@fontsource-variable`, no external requests.

**The mark — "the loop that won't close":** `src/components/Wordmark.astro` (and
`public/favicon.svg`). A single one-stroke ring that refuses to close and
overshoots itself. No frame, no arrow. The form *is* the idea: a thing that
won't be contained.

**Hero artwork:** `src/components/HeroArt.astro` — a hand-built SVG ("The Big
Signal"): contour rings + a candlestick rhythm + a violet trend line that breaks
the frame. Drawn from scratch; nothing sourced from the web.

---

## Project structure

```
src/
  components/   Nav (mark only), Footer, HeroArt, Wordmark
  content/
    posts/      ← the writing lives here (Markdown, one file per piece)
  content.config.ts   content schema (no public categories)
  layouts/Base.astro  shared <head>, nav, footer, scroll-reveal
  lib/format.ts       date helper
  pages/index.astro   the homepage (hero · index · creed)
  styles/             tokens.css (the brand) + global.css
public/         favicon + future static assets
```

## Writing a post (today)

Drop a Markdown file in `src/content/posts/`. Frontmatter:

```yaml
---
title: "Headline"
dek: "One-line standfirst — shown only on hover."
publishedAt: 2026-06-13
readingMinutes: 7
featured: false      # true = becomes the 'way-in' piece at the top
# desk / tags are optional PRIVATE notes for me. They are never rendered.
---
```

The homepage reads this collection automatically.

---

## Roadmap (next phases)

This phase delivered the **brand, design system, and homepage**. Planned next,
all keeping the no-categories / no-capture rules:

1. **In-browser author studio** — a private `/studio` (Git-backed CMS, e.g.
   TinaCMS/Decap) so I can write and publish from any browser. The schema is
   already shaped for it.
2. **Reading page** — `src/pages/posts/[...slug].astro` with a proper prose
   layout and rich/multi-modal embeds (charts, callouts, pull-quotes). Still no
   category label on the piece.
3. **A colophon / about page** — optional, personal, first person.
4. **Deploy** — push to GitHub, connect to Vercel, point `dhosae.in` at it.

---

_© dhosae — unorthodox on purpose._
