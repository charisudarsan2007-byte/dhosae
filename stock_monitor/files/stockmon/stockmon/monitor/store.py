"""SQLite persistence: tracks which announcement UIDs have been seen.

This is what makes the monitor alert exactly once per filing and survive
restarts without re-alerting old filings.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from .models import Announcement

_SCHEMA = """
CREATE TABLE IF NOT EXISTS seen (
    uid        TEXT PRIMARY KEY,
    source     TEXT,
    symbol     TEXT,
    headline   TEXT,
    ts         TEXT,
    alerted    INTEGER DEFAULT 1,
    recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


class Store:
    def __init__(self, path: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.con = sqlite3.connect(path)
        self.con.execute(_SCHEMA)
        self.con.commit()

    def is_new(self, uid: str) -> bool:
        cur = self.con.execute("SELECT 1 FROM seen WHERE uid = ?", (uid,))
        return cur.fetchone() is None

    def mark_seen(self, a: Announcement, *, alerted: bool = True) -> None:
        self.con.execute(
            "INSERT OR IGNORE INTO seen(uid, source, symbol, headline, ts, alerted) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (a.uid, a.source, a.symbol, a.headline, a.timestamp.isoformat(), int(alerted)),
        )
        self.con.commit()

    def count(self) -> int:
        return self.con.execute("SELECT COUNT(*) FROM seen").fetchone()[0]

    def close(self) -> None:
        self.con.close()
