"""Load and lightly validate config.yaml into a typed object."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import time

import yaml


@dataclass
class ActiveHours:
    start: time
    end: time
    weekdays_only: bool = True


@dataclass
class Config:
    poll_interval_seconds: int
    active_hours: ActiveHours
    watchlist: list[dict]
    sources: dict
    filters: dict
    alerting: dict
    db_path: str
    log_level: str
    log_file: str | None
    raw: dict = field(default_factory=dict)


def _parse_hhmm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def load_config(path: str = "config.yaml") -> Config:
    with open(path, "r", encoding="utf-8") as fh:
        d = yaml.safe_load(fh)

    ah = d.get("active_hours", {})
    active = ActiveHours(
        start=_parse_hhmm(ah.get("start", "08:00")),
        end=_parse_hhmm(ah.get("end", "23:00")),
        weekdays_only=ah.get("weekdays_only", True),
    )

    watchlist = d.get("watchlist", [])
    if not watchlist:
        raise ValueError("config.yaml: 'watchlist' is empty - add at least one company")

    return Config(
        poll_interval_seconds=int(d.get("poll_interval_seconds", 60)),
        active_hours=active,
        watchlist=watchlist,
        sources=d.get("sources", {"bse": True, "nse": True}),
        filters=d.get("filters", {}) or {},
        alerting=d.get("alerting", {}),
        db_path=d.get("storage", {}).get("db_path", "./data/monitor.db"),
        log_level=d.get("logging", {}).get("level", "INFO"),
        log_file=d.get("logging", {}).get("file"),
        raw=d,
    )


def env(name: str | None, *, required: bool = False) -> str | None:
    """Read a secret from the environment by variable name."""
    if not name:
        return None
    val = os.environ.get(name)
    if required and not val:
        raise RuntimeError(f"Required environment variable '{name}' is not set")
    return val
