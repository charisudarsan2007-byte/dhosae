"""The polling loop: active-hours gate, dedup, fan-out to alerter.

Design rule: the loop must never die. Every iteration is wrapped, and every
source swallows its own errors, so a bad response just means "nothing new this
cycle" rather than a crash.
"""
from __future__ import annotations

import logging
import random
import time
from datetime import datetime

from .alert import Alerter
from .config import Config
from .filters import Filter
from .models import IST
from .sources.base import Source
from .store import Store

log = logging.getLogger("runner")


def within_active_hours(cfg: Config, now: datetime | None = None) -> bool:
    now = now or datetime.now(IST)
    if cfg.active_hours.weekdays_only and now.weekday() >= 5:
        return False
    return cfg.active_hours.start <= now.time() <= cfg.active_hours.end


def poll_once(
    sources: list[Source], store: Store, alerter: Alerter, filt: Filter,
    watchlist: list[dict], *, alert: bool = True,
) -> int:
    """Run a single pass across all sources. Returns count of new items handled."""
    new_count = 0
    for src in sources:
        for ann in src.fetch(watchlist):
            if not store.is_new(ann.uid):
                continue
            new_count += 1
            if alert and filt.passes(ann):
                alerter.send(ann)
                store.mark_seen(ann, alerted=True)
                log.info("ALERTED %s %s | %s", ann.source, ann.symbol, ann.headline[:80])
            else:
                store.mark_seen(ann, alerted=False)
                log.debug("seen (suppressed/seed) %s %s", ann.source, ann.symbol)
    return new_count


def run(
    cfg: Config, sources: list[Source], store: Store, alerter: Alerter, filt: Filter,
) -> None:
    log.info("monitor started; %d source(s), %d watchlist item(s), %d seen in db",
             len(sources), len(cfg.watchlist), store.count())
    while True:
        try:
            if within_active_hours(cfg):
                n = poll_once(sources, store, alerter, filt, cfg.watchlist, alert=True)
                if n:
                    log.info("cycle: %d new announcement(s)", n)
            else:
                log.debug("outside active hours; sleeping")
        except Exception:
            log.exception("loop iteration failed; continuing")
        # jitter the interval +/-5s to avoid a perfectly periodic fingerprint
        time.sleep(max(5.0, cfg.poll_interval_seconds + random.uniform(-5, 5)))
