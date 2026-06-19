# stockmon — Live Deployment Handoff Spec

**Audience:** a fresh Claude Code session tasked with deploying this project live.
**Owner goal:** get an instant alert the moment a **watchlisted stock files a board-meeting
announcement on BSE**, plus a web page showing the monitor's live status/log, so the owner
can decide to trade manually.

> **SCOPE BOUNDARY — READ FIRST.** This system is **alert-only**. It must NOT place orders,
> connect to a broker/trading API, or move money. It tells a human "a filing dropped"; the
> human trades. Do not add automated trading. If asked to, stop and confirm with the owner.

---

## 1. Current state (already done — do not redo)

- Python package `monitor/` is complete and imports cleanly (Python 3.12/3.13).
- **Architecture:** `runner.py` polling loop → `sources/bse.py` (primary) returns normalized
  `Announcement`s → `store.py` SQLite dedup (alert once, survive restarts) → `filters.py`
  keyword gate → `alert.py` fans out to enabled channels.
- **Verified live (2026-06-18):**
  - BSE source maps `uid / headline / timestamp / category / pdf url` correctly from the real
    response; the constructed AttachLive PDF URL returns `200 application/pdf`.
  - The **ntfy** channel delivers end-to-end (urgent priority, `rotating_light` tag, full body).
- **Bugs already fixed in this repo:**
  1. `requirements.txt` was missing **`tzdata`** → `ZoneInfo("Asia/Kolkata")` crashed on import
     on Windows and slim Linux images. Added.
  2. `config.yaml` filter default + comment steered users toward `categories: ["Board Meeting"]`,
     which **silently misses every "Outcome of Board Meeting" filing** (see §3). Changed default
     to the verified-safe `keywords: ["board meeting"]`.

## 2. Owner's chosen options (constraints for this deploy)

| Decision | Choice | Implication |
|---|---|---|
| Alert channel | **ntfy push only** | No Telegram/SMS/email to wire. Keep the registry; just configure ntfy. |
| Web UI | **Interactive console** | Build as an **allow-listed command console**, NOT a raw shell (see §5). |
| Hosting | **Existing web host** | Must confirm the host can run an always-on process (see §6). |

## 3. Board-meeting filtering (the core feature — get this right)

Live BSE data confirmed: board-meeting filings always have `CATEGORYNAME="Board Meeting"`, but
`SUBCATNAME` is `"Board Meeting"` **or** `"Outcome of Board Meeting"`. The source maps
`category = SUBCATNAME or CATEGORYNAME` (`monitor/sources/bse.py`).

- ✅ **Use `filters.keywords: ["board meeting"]`** — substring match over headline+category,
  catches both subcategories. This is the current default.
- ❌ **Do NOT use `filters.categories: ["Board Meeting"]`** — exact match against the mapped
  (sub)category; misses the "Outcome of Board Meeting" filings, which are the ones worth trading on.

**Optional hardening (only if owner wants exact category filtering too):** in
`monitor/sources/bse.py._to_announcement`, additionally fetch server-side with
`bse.announcements(..., category="Board Meeting")`, or change `filters.py` category matching from
exact (`a.category.lower() in self.categories`) to substring. Discuss before changing semantics.

## 4. ntfy setup (owner action + config)

1. Owner installs the **ntfy** app (Android/iOS) or uses the web app.
2. Pick a **long, unguessable topic** (ntfy.sh topics are public to anyone who knows the name),
   e.g. `stockmon-<random-hex>`. Subscribe to it in the app.
3. Set it in `config.yaml` → `alerting.channels.ntfy.topic`. Leave `token_env: ""` for public
   ntfy.sh; only set a token for a self-hosted/reserved topic.
4. Confirm: `python -m monitor.main --test-alert` → a test push should arrive.

## 5. Web "terminal" — build as an allow-listed command console

The owner wants an interactive terminal feel. **A raw web shell on a public site is remote code
execution as a service — do not build that.** Build a console that only runs a fixed set of
monitor actions.

**Backend (recommend FastAPI + Uvicorn):**
- `GET /` → serves the console page.
- `GET /api/stream` → **Server-Sent Events** (or WebSocket) tailing `data/monitor.log`, so the
  page shows the live loop output like a terminal.
- `POST /api/cmd` with `{ "cmd": "<name>" }` where `<name>` is from a **hardcoded allowlist**:
  - `status`  → `systemctl --user status stockmon` (or read a status file)
  - `seed`    → run `python -m monitor.main --seed`
  - `once`    → run `python -m monitor.main --once`
  - `restart` → restart the service
  - `tail`    → last N lines of the log
  No free-form strings are ever passed to a shell. Reject anything not in the map.
- `GET /api/alerts` → recent alerts from SQLite (`store.py` `seen` table) as JSON for a history view.

**Frontend:** a single page using **xterm.js** for the terminal look; render the SSE stream into
it; provide buttons (or a prompt that maps typed words → allowlist) for the commands above.

**Mandatory security (non-negotiable for a public host):**
- Auth in front of everything (HTTP Basic over TLS at minimum; better: a reverse-proxy login).
- **TLS only** (the host's HTTPS / a reverse proxy). Never expose plain HTTP.
- Run the web app and monitor as a **non-root** user.
- Bind to localhost and put it behind the host's reverse proxy; don't expose the raw port.
- Rate-limit `/api/cmd`. Log every command with timestamp + source IP.

**If the owner truly insists on a raw shell:** document the risk in writing, require all of the
above PLUS an IP allowlist, a dedicated low-privilege container, and a kill switch. Mark it
"NOT RECOMMENDED." Default to the allow-listed console.

## 6. Hosting on an existing web host — confirm feasibility FIRST

The monitor is an **always-on Python loop**, not a request/response script. Before building:

**Confirm the host supports:**
- A persistent background process (systemd, supervisor, PM2, or Docker) — **most shared/cPanel
  hosts do NOT** and will kill long-running processes. If so, recommend a small VPS instead.
- Outbound HTTPS to `bseindia.com` and `ntfy.sh`.
- A port (behind the reverse proxy) for the web console.
- Python 3.11+.

**Deploy steps (generic Linux host with systemd):**
1. `git clone`/copy the repo to e.g. `/opt/stockmon` (or `~/stockmon`).
2. `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
   (`requirements.txt` now includes `tzdata`).
3. `cp .env.example .env` (ntfy public topic needs no secrets; file must exist for the unit).
4. Edit `config.yaml`: real **watchlist** (BSE scrip codes), ntfy topic, keep board-meeting filter.
5. **Seed before going live:** `python -m monitor.main --seed` (marks today's filings seen, no
   alerts — prevents a flood on first run).
6. Install the service. A ready unit exists: `stockmon.service` (system) — adjust `WorkingDirectory`,
   `EnvironmentFile`, `ExecStart` paths. For a non-root/user service, mirror `setup_wsl.sh`.
7. Add the web app as a second unit (`stockmon-web.service`) running the FastAPI app via Uvicorn,
   behind the host's reverse proxy with TLS + auth.
8. Verify: test alert arrives, console page loads over HTTPS, `once` returns, log streams live.

## 7. Watchlist

Replace the sample entries in `config.yaml`. Each: `name`, `bse_scrip` (fast path — look up the
6-digit BSE scrip code; e.g. Reliance `500325`, TCS `532540`), and `nse_symbol` (only if NSE is
enabled later). NSE is off by default and best-effort; keep it off unless BSE alone proves
insufficient.

## 8. Acceptance criteria (definition of done)

- [ ] Host confirmed able to run an always-on process (or VPS chosen).
- [ ] Monitor runs as a non-root service, auto-restarts on crash, starts on boot.
- [ ] DB seeded; no historical flood on first start.
- [ ] A real (or simulated) board-meeting filing for a watchlisted stock produces exactly one
      ntfy push, with the PDF link, within ~poll interval.
- [ ] Web console loads over HTTPS behind auth; live log streams; allow-listed commands work;
      no free-form shell execution path exists.
- [ ] No broker/trading integration anywhere. Alert-only confirmed.

## 9. Open items to confirm with the owner

- Poll interval (default 60s — politeness vs latency).
- Active hours (default 08:00–23:00 IST, weekdays) — board-meeting outcomes often post evenings.
- Whether to add Telegram/SMS/email later (registry makes this easy; ntfy-only for now).
- Exact host name/capabilities (drives §6).
