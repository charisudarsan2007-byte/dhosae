"""NSE source (best-effort secondary).

NSE actively blocks automated access. The `nse` library handles the session
cookie bootstrap and (with server=True) uses httpx+HTTP/2 which works on cloud
VMs. Even so, expect periodic 401s / empty responses - these are treated as
"NSE temporarily unavailable": logged as warnings, never raised.

Verified response fields:
  symbol, desc, attchmntText, attchmntFile, an_dt, sort_date, seq_id, sm_name
"""
from __future__ import annotations

import logging
from pathlib import Path

from ..models import Announcement, parse_ist
from .base import Source

log = logging.getLogger("source.nse")

_NSE_FORMATS = ("%Y-%m-%d %H:%M:%S", "%d-%b-%Y %H:%M:%S")


class NseSource(Source):
    name = "NSE"

    def __init__(self, download_folder: str = "./data", server: bool = True):
        from nse import NSE  # imported lazily so a broken nse install can't block BSE
        self.nse = NSE(download_folder=Path(download_folder), server=server)

    def _to_announcement(self, symbol: str, row: dict) -> Announcement | None:
        uid = row.get("seq_id")
        if not uid:
            return None
        headline = (row.get("attchmntText") or row.get("desc") or "").strip() or "(no text)"
        category = row.get("desc")
        ts = parse_ist(row.get("sort_date") or row.get("an_dt"), _NSE_FORMATS)
        url = row.get("attchmntFile") or None
        return Announcement(
            source=self.name, symbol=symbol, uid=f"NSE:{uid}",
            headline=headline, category=category, timestamp=ts,
            url=url, critical=False, raw=row,
        )

    def fetch(self, watchlist: list[dict]) -> list[Announcement]:
        out: list[Announcement] = []
        for item in watchlist:
            symbol = item.get("nse_symbol")
            if not symbol:
                continue
            try:
                rows = self.nse.announcements(index="equities", symbol=symbol)
                if not isinstance(rows, list):
                    rows = []
            except Exception as exc:
                # NSE flakiness is expected; warn and move on. BSE keeps working.
                log.warning("NSE: fetch failed for %s (%s) - continuing", symbol, exc)
                continue
            for row in rows:
                ann = self._to_announcement(symbol, row)
                if ann:
                    out.append(ann)
        return out

    def close(self) -> None:
        try:
            self.nse.exit()
        except Exception:
            pass
