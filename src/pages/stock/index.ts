// Stock — the watchtower beside the Dojo. An alert-only monitor over BSE
// corporate filings: the moment a watchlisted company files a board-meeting
// announcement, a push lands. It reads and alerts; it never trades.
// Served raw (its own dark <html>) at a clean /stock URL, exactly like the Dojo,
// so the dark world is consistent from the nav through the whole section.
import type { APIRoute } from "astro";
import html from "../../stock/index.html?raw";

export const GET: APIRoute = () =>
  new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
