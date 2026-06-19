"""Normalized data model shared by every source."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")


@dataclass(frozen=True)
class Announcement:
    source: str                 # "BSE" | "NSE" | "RSS"
    symbol: str                 # watchlist key, e.g. "RELIANCE"
    uid: str                    # STABLE unique id, used for dedup
    headline: str
    timestamp: datetime         # tz-aware, Asia/Kolkata
    category: str | None = None
    url: str | None = None
    critical: bool = False      # exchange "critical news" flag if available
    raw: dict = field(default_factory=dict, repr=False, compare=False)


def parse_ist(value: str | None, formats: tuple[str, ...]) -> datetime:
    """Parse a datetime string into a tz-aware IST datetime.

    Tries datetime.fromisoformat first, then each explicit format.
    Falls back to 'now' in IST so a single bad timestamp never crashes a poll.
    """
    if value:
        s = value.strip()
        try:
            dt = datetime.fromisoformat(s)
            return dt.replace(tzinfo=IST) if dt.tzinfo is None else dt.astimezone(IST)
        except ValueError:
            pass
        for fmt in formats:
            try:
                return datetime.strptime(s, fmt).replace(tzinfo=IST)
            except ValueError:
                continue
    return datetime.now(IST)
