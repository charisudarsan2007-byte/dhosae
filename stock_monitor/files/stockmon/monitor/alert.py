"""Alert channels (no Telegram).

Three pluggable, free, India-accessible options:

  - ntfy   : ntfy.sh push notifications. Easiest Telegram replacement.
             Install the "ntfy" app, subscribe to a topic, done. No account.
  - discord: Discord incoming webhook. Free, instant push via the Discord app.
             Create one in Server Settings -> Integrations -> Webhooks.
  - email  : SMTP (e.g. Gmail with an App Password). Universal fallback.
  - web    : POSTs the structured filing to dhosae.in/api/stock/ingest so it
             also "drops" onto the /stock page. Bearer-token auth. Lets you read
             the same alerts on the web, not just on the phone.

Enable any combination in config.yaml under `alerting.channels`.
Each channel swallows its own send errors so one dead channel can't stop the
others (or crash the loop).
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

import requests

from .config import env
from .models import Announcement

log = logging.getLogger("alert")

_PRIORITY_PREFIX = {True: "\U0001F6A8", False: "\U0001F514"}  # 🚨 / 🔔


def format_alert(a: Announcement) -> tuple[str, str]:
    """Return (title, body) for an announcement."""
    prefix = _PRIORITY_PREFIX[a.critical]
    title = f"{prefix} [{a.source}] {a.symbol}"
    lines = [a.headline.strip()]
    if a.category:
        lines.append(f"Category: {a.category}")
    lines.append(a.timestamp.strftime("%Y-%m-%d %H:%M IST"))
    if a.url:
        lines.append(a.url)
    return title, "\n".join(lines)


class Channel:
    name = "base"

    def send(self, title: str, body: str, critical: bool) -> None:  # pragma: no cover
        raise NotImplementedError


class NtfyChannel(Channel):
    """Push via ntfy.sh (or a self-hosted ntfy server)."""
    name = "ntfy"

    def __init__(self, cfg: dict):
        server = cfg.get("server", "https://ntfy.sh").rstrip("/")
        topic = cfg.get("topic")
        if not topic:
            raise ValueError("ntfy channel needs a 'topic' in config")
        self.url = f"{server}/{topic}"
        # Optional token for protected topics (self-hosted / reserved topics).
        self.token = env(cfg.get("token_env"))

    def send(self, title: str, body: str, critical: bool) -> None:
        headers = {
            "Title": title.encode("utf-8"),
            "Priority": "urgent" if critical else "default",
            "Tags": "rotating_light" if critical else "bell",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        requests.post(self.url, data=body.encode("utf-8"), headers=headers, timeout=10)


class DiscordChannel(Channel):
    """Push via a Discord incoming webhook."""
    name = "discord"

    def __init__(self, cfg: dict):
        self.webhook = env(cfg.get("webhook_url_env"), required=True)

    def send(self, title: str, body: str, critical: bool) -> None:
        # Discord renders **bold**; keep it simple and within limits (2000 chars).
        content = f"**{title}**\n{body}"[:1900]
        requests.post(self.webhook, json={"content": content}, timeout=10)


class EmailChannel(Channel):
    """Send via SMTP (STARTTLS). Use an app-specific password, never your main one."""
    name = "email"

    def __init__(self, cfg: dict):
        self.host = cfg["smtp_host"]
        self.port = int(cfg.get("smtp_port", 587))
        self.user = env(cfg.get("user_env"), required=True)
        self.password = env(cfg.get("password_env"), required=True)
        self.to_addr = cfg["to"]

    def send(self, title: str, body: str, critical: bool) -> None:
        msg = EmailMessage()
        msg["Subject"] = title
        msg["From"] = self.user
        msg["To"] = self.to_addr
        msg.set_content(body)
        with smtplib.SMTP(self.host, self.port, timeout=20) as s:
            s.starttls()
            s.login(self.user, self.password)
            s.send_message(msg)


class WebChannel(Channel):
    """POST the structured filing to the dhosae.in web feed (alongside the push).

    Unlike the other channels this sends JSON, not formatted text, so the website
    can render it natively (headline, category badge, BSE link). Dedup happens
    server-side on the filing's uid, so retries/overlapping polls are harmless.
    """
    name = "web"

    def __init__(self, cfg: dict):
        self.url = cfg.get("ingest_url")
        if not self.url:
            raise ValueError("web channel needs an 'ingest_url' in config")
        self.token = env(cfg.get("token_env"), required=True)

    def send_alert(self, a: Announcement) -> None:
        payload = {
            "uid": a.uid,
            "source": a.source,
            "symbol": a.symbol,
            "headline": a.headline,
            "category": a.category or "",
            "url": a.url or "",
            "ts": a.timestamp.isoformat(),
            "critical": bool(a.critical),
        }
        requests.post(
            self.url, json=payload,
            headers={"Authorization": f"Bearer {self.token}"}, timeout=10,
        )

    def send(self, title: str, body: str, critical: bool) -> None:  # pragma: no cover
        # Not used: the Alerter calls send_alert() with the full announcement.
        pass


_REGISTRY = {
    "ntfy": NtfyChannel, "discord": DiscordChannel,
    "email": EmailChannel, "web": WebChannel,
}


class Alerter:
    """Fan-out to every enabled channel."""

    def __init__(self, alerting_cfg: dict):
        self.channels: list[Channel] = []
        for name, ch_cfg in (alerting_cfg.get("channels") or {}).items():
            if not ch_cfg or not ch_cfg.get("enabled", True):
                continue
            cls = _REGISTRY.get(name)
            if not cls:
                log.warning("unknown alert channel '%s' - skipping", name)
                continue
            try:
                self.channels.append(cls(ch_cfg))
                log.info("alert channel enabled: %s", name)
            except Exception:
                log.exception("failed to init alert channel '%s'", name)
        if not self.channels:
            log.warning("no alert channels enabled - alerts will be logged only")

    def send(self, a: Announcement) -> None:
        title, body = format_alert(a)
        if not self.channels:
            log.info("[ALERT-ONLY-LOG] %s | %s", title, body.replace("\n", " | "))
            return
        for ch in self.channels:
            try:
                if isinstance(ch, WebChannel):
                    ch.send_alert(a)  # structured JSON, not formatted text
                else:
                    ch.send(title, body, a.critical)
            except Exception:
                log.exception("channel '%s' failed to send", ch.name)

    def send_test(self) -> None:
        from datetime import datetime
        from .models import IST
        a = Announcement(
            source="TEST", symbol="PING", uid="test",
            headline="Test alert - your monitor's alert channels are working.",
            timestamp=datetime.now(IST), category="Self-test", url=None, critical=False,
        )
        self.send(a)
