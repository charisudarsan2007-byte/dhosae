"""Source interface. Every source returns normalized Announcements and must
never raise on network/parse errors - it logs and returns [] instead, so one
failing source can't take down the loop."""
from __future__ import annotations

from abc import ABC, abstractmethod

from ..models import Announcement


class Source(ABC):
    name: str = "base"

    @abstractmethod
    def fetch(self, watchlist: list[dict]) -> list[Announcement]:
        ...

    def close(self) -> None:  # optional cleanup
        pass
