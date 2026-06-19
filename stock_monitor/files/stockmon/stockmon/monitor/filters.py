"""Optional filtering: only alert on announcements matching keywords/categories.

Empty filter config => everything passes.
"""
from __future__ import annotations

from .models import Announcement


class Filter:
    def __init__(self, cfg: dict):
        self.keywords = [k.lower() for k in (cfg.get("keywords") or [])]
        self.categories = [c.lower() for c in (cfg.get("categories") or [])]

    def passes(self, a: Announcement) -> bool:
        # No filters configured -> pass everything.
        if not self.keywords and not self.categories:
            return True

        hay = " ".join(filter(None, [a.headline, a.category])).lower()

        if self.keywords and any(k in hay for k in self.keywords):
            return True
        if self.categories and a.category and a.category.lower() in self.categories:
            return True
        return False
