# stockmon — Indian Stock Corporate-Announcement Monitor

Watches **BSE/NSE corporate filings** for a personal watchlist and pushes an
instant alert the moment a new filing is disclosed. **No Telegram** — uses
ntfy.sh, Discord webhooks, and/or email.

> It alerts you when a filing becomes *public* (latency ≈ poll interval + a few
> seconds). That means you never miss a disclosure on your watchlist. It does
> **not** beat algorithmic traders reading the same feed — treat it as
> "don't be the last to know," not an arbitrage edge. Personal, low-volume use;
> respect the exchanges' terms and keep polling intervals polite.

## Layout

```
stockmon/
├── config.yaml          # watchlist, sources, alert channels, filters
├── .env.example         # secrets template (copy to .env)
├── requirements.txt
├── run.py               # python run.py ...  (same as python -m monitor.main)
├── stockmon.service     # systemd unit for always-on deployment
└── monitor/
    ├── models.py        # Announcement dataclass + IST datetime parsing
    ├── config.py        # YAML + env loader
    ├── store.py         # SQLite dedup (alert once, survive restarts)
    ├── filters.py       # keyword/category suppression
    ├── alert.py         # ntfy / discord / email channels (fan-out)
    ├── runner.py        # crash-proof polling loop + active-hours gate
    ├── main.py          # CLI entrypoint
    └── sources/
        ├── base.py
        ├── bse.py       # PRIMARY (reliable)
        └── nse.py       # SECONDARY (best-effort; expects flakiness)
```

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in any channel secrets you use
```

Edit `config.yaml`: set your **watchlist** and turn on the **alert channel(s)**
you want. Then export secrets (`set -a; source .env; set +a`) or rely on the
systemd `EnvironmentFile`.

## Alert channels (pick one or more)

**ntfy.sh (easiest, free, no account).** Install the *ntfy* app (Android/iOS) or
use the web app, subscribe to a topic, and put that same topic in `config.yaml`
(`alerting.channels.ntfy.topic`). Choose a long random topic name — ntfy.sh
topics are public to anyone who knows the name. No secret needed for public
topics.

**Discord (free, instant).** In your server: *Settings → Integrations → Webhooks
→ New Webhook*, copy the URL, put it in `.env` as `DISCORD_WEBHOOK_URL`, and set
`alerting.channels.discord.enabled: true`.

**Email (universal).** Use an app-specific password (e.g. a Gmail App Password),
set `SMTP_USER`/`SMTP_PASS` in `.env`, fill in `to:` and enable the email channel.

Verify everything before going live:

```bash
python -m monitor.main --test-alert    # sends a test to every enabled channel
```

## First run (important: seed before you go live)

On a fresh database, *every* current filing looks new and would flood you. Seed
once to mark today's existing filings as seen **without alerting**, then run
normally:

```bash
python -m monitor.main --seed      # mark today's filings as seen, no alerts
python -m monitor.main             # run forever
```

Other modes:

```bash
python -m monitor.main --once      # single pass then exit (handy for testing)
```

## Sources

- **BSE is primary and reliable.** Look up by scrip code (set `bse_scrip` in the
  watchlist for speed, or let it resolve from the company name at startup).
- **NSE is best-effort.** It actively blocks bots. The library handles session
  cookies and uses HTTP/2 in server mode (`nse_server_mode: true`, important on
  cloud VMs). NSE failures are logged as warnings and never stop the loop — BSE
  keeps working. Enable NSE (`sources.nse: true`) only after BSE works for you.

## Deploy (always-on)

```bash
sudo cp -r . /opt/stockmon
sudo cp stockmon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stockmon
journalctl -u stockmon -f          # watch logs
```

If NSE consistently 401s from a cloud IP, run BSE-only there (NSE blocks many
datacenter ranges) or run NSE from a residential connection.

## How it stays reliable

- **Dedup in SQLite** keyed on the exchange's own stable id (BSE `NEWSID`, NSE
  `seq_id`) → each filing alerts exactly once, even across restarts.
- **Every source swallows its own errors** and returns nothing on failure.
- **The loop wraps each iteration** in try/except and jitters the interval, so it
  never dies and never looks like a perfectly periodic bot.

## Notes / gotchas

- Unofficial libraries (`bse`, `nse`) can break when the exchange sites change.
  If a source goes quiet, check for a newer library release first.
- Times are handled in `Asia/Kolkata`.
- Want news context too? A Tier-2 RSS source (Economic Times / Google News feeds
  via `feedparser`) drops into `sources/` with the same interface — left as a
  follow-on.
