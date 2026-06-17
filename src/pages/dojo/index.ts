// The Dojo hub — the entrance hall to the knowledge-buildout wing. Lists the
// disciplines (each a self-contained dark module served raw at its own clean URL).
// Served raw rather than wrapped in the journal's warm Base layout so the dark
// world is consistent from the hub through every discipline.
import type { APIRoute } from "astro";
import html from "../../dojo/index.html?raw";

export const GET: APIRoute = () =>
  new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
