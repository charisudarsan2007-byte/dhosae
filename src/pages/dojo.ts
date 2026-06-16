// The Dojo — a hardcore knowledge-buildout lab. The whole interactive module is a
// single self-contained document (its own <html>, dark theme, full-screen player),
// so we serve it raw at a clean /dojo URL instead of wrapping it in the journal's
// warm Base layout. Discipline 01 = Futures, built from Zerodha Varsity.
import type { APIRoute } from "astro";
import html from "../dojo/futures.html?raw";

export const GET: APIRoute = () =>
  new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
