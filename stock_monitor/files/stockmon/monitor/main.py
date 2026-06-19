"""Entrypoint.

Usage:
    python -m monitor.main --test-alert   # send a test alert and exit
    python -m monitor.main --seed         # mark today's existing filings as seen
                                          #   WITHOUT alerting (run once on first setup)
    python -m monitor.main --once         # one polling pass, then exit (good for cron)
    python -m monitor.main                # run forever (normal mode)
"""
from __future__ import annotations

import argparse
import logging
import sys

from .alert import Alerter
from .config import load_config
from .filters import Filter
from .runner import poll_once, run
from .sources.base import Source
from .store import Store


def setup_logging(level: str, file: str | None) -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    if file:
        import os
        os.makedirs(os.path.dirname(file) or ".", exist_ok=True)
        handlers.append(logging.FileHandler(file))
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=handlers,
    )


def build_sources(cfg) -> list[Source]:
    sources: list[Source] = []
    folder = cfg.raw.get("storage", {}).get("data_folder", "./data")
    if cfg.sources.get("bse", True):
        from .sources.bse import BseSource
        try:
            sources.append(BseSource(download_folder=folder))
            logging.getLogger("main").info("source ready: BSE")
        except Exception:
            logging.getLogger("main").exception("could not init BSE source")
    if cfg.sources.get("nse", False):
        try:
            from .sources.nse import NseSource
            server = bool(cfg.raw.get("sources", {}).get("nse_server_mode", True))
            sources.append(NseSource(download_folder=folder, server=server))
            logging.getLogger("main").info("source ready: NSE")
        except Exception:
            logging.getLogger("main").exception("could not init NSE source (continuing without it)")
    return sources


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Indian stock corporate-announcement monitor")
    p.add_argument("--config", default="config.yaml")
    p.add_argument("--test-alert", action="store_true", help="send a test alert and exit")
    p.add_argument("--seed", action="store_true",
                   help="mark today's filings as seen WITHOUT alerting, then exit")
    p.add_argument("--once", action="store_true", help="one polling pass, then exit")
    args = p.parse_args(argv)

    cfg = load_config(args.config)
    setup_logging(cfg.log_level, cfg.log_file)
    log = logging.getLogger("main")

    alerter = Alerter(cfg.alerting)

    if args.test_alert:
        alerter.send_test()
        log.info("test alert sent (check your channels)")
        return 0

    store = Store(cfg.db_path)
    filt = Filter(cfg.filters)
    sources = build_sources(cfg)
    if not sources:
        log.error("no sources available - aborting")
        return 1

    # make watchlist visible to poll_once

    try:
        if args.seed:
            n = poll_once(sources, store, alerter, filt, cfg.watchlist, alert=False)
            log.info("seed complete: marked %d existing announcement(s) as seen "
                     "(no alerts sent). Now run without --seed.", n)
            return 0
        if args.once:
            n = poll_once(sources, store, alerter, filt, cfg.watchlist, alert=True)
            log.info("single pass complete: %d new", n)
            return 0
        run(cfg, sources, store, alerter, filt)
    finally:
        for s in sources:
            s.close()
        store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
