// The Dojo · Discipline 01 — Finance (futures trading, built from Zerodha Varsity).
// A single self-contained dark document (its own <html>, full-screen lesson player),
// served raw at a clean /dojo/finance URL.
import type { APIRoute } from "astro";
import html from "../../dojo/finance.html?raw";

export const GET: APIRoute = () =>
  new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
