"""BSE source (primary). Uses the `bse` library's announcements() endpoint.

Field names below are taken from the real BSE response shape:
  NEWSID, SCRIP_CD, NEWSSUB, HEADLINE, DT_TM, News_submission_dt,
  ATTACHMENTNAME, CATEGORYNAME, SUBCATNAME, CRITICALNEWS, NSURL, ...
"""
from __future__ import annotations

import logging

from bse import BSE

from ..models import Announcement, parse_ist
from .base import Source

log = logging.getLogger("source.bse")

# Live filing attachments live here; the response only gives the filename.
_ATTACH_BASE = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/"

_BSE_FORMATS = ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f")


class BseSource(Source):
    name = "BSE"

    def __init__(self, download_folder: str = "./data"):
        self.bse = BSE(download_folder=download_folder)
        self._scrip_cache: dict[str, str] = {}

    def _resolve_scrip(self, item: dict) -> str | None:
        if item.get("bse_scrip"):
            return str(item["bse_scrip"])
        name = item.get("name") or item.get("nse_symbol")
        if not name:
            return None
        if name not in self._scrip_cache:
            try:
                self._scrip_cache[name] = str(self.bse.getScripCode(name))
            except Exception:
                log.warning("BSE: could not resolve scrip code for %r", name)
                return None
        return self._scrip_cache[name]

    def _to_announcement(self, symbol: str, row: dict) -> Announcement | None:
        uid = row.get("NEWSID")
        if not uid:
            return None
        headline = (row.get("HEADLINE") or row.get("NEWSSUB") or "").strip() or "(no headline)"
        category = row.get("SUBCATNAME") or row.get("CATEGORYNAME")
        ts = parse_ist(row.get("News_submission_dt") or row.get("DT_TM"), _BSE_FORMATS)
        attach = (row.get("ATTACHMENTNAME") or "").strip()
        url = (_ATTACH_BASE + attach) if attach else (row.get("NSURL") or None)
        critical = str(row.get("CRITICALNEWS", "0")).strip() in ("1", "True", "true")
        return Announcement(
            source=self.name, symbol=symbol, uid=f"BSE:{uid}",
            headline=headline, category=category, timestamp=ts,
            url=url, critical=critical, raw=row,
        )

    def fetch(self, watchlist: list[dict]) -> list[Announcement]:
        out: list[Announcement] = []
        for item in watchlist:
            symbol = item.get("nse_symbol") or item.get("name") or "?"
            scrip = self._resolve_scrip(item)
            if not scrip:
                continue
            try:
                data = self.bse.announcements(scripcode=scrip)  # current day, page 1
                rows = data.get("Table", []) if isinstance(data, dict) else []
            except Exception:
                log.exception("BSE: fetch failed for %s (scrip %s)", symbol, scrip)
                continue
            for row in rows:
                ann = self._to_announcement(symbol, row)
                if ann:
                    out.append(ann)
        return out

    def close(self) -> None:
        try:
            self.bse.exit()
        except Exception:
            pass
