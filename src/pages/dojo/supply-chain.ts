// The Dojo · Discipline 02 — Supply Chain (Chapter 1, from Chopra·Meindl·Kalra).
// A single self-contained dark document, served raw at a clean /dojo/supply-chain URL.
import type { APIRoute } from "astro";
import html from "../../dojo/supply-chain.html?raw";

export const GET: APIRoute = () =>
  new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
