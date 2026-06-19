import type { APIRoute } from "astro";
import { insertStockAlert } from "../../../lib/db";

/**
 * Write side of the watchtower feed. The Python monitor (stockmon) POSTs each
 * filing here — alongside its ntfy push — so it "drops" onto /stock too.
 *
 *   POST /api/stock/ingest
 *   Authorization: Bearer <STOCK_INGEST_TOKEN>
 *   { uid, source, symbol, headline, category, url, ts, critical }
 *
 * Auth is a single shared bearer token (env STOCK_INGEST_TOKEN). If the env var
 * is unset the endpoint refuses every write — it never silently runs open.
 * Dedup is by uid, so a retry or overlapping poll can't double-post.
 */
function env(key: string): string | undefined {
  return process.env[key] ?? (import.meta.env as Record<string, string>)[key];
}

export const POST: APIRoute = async ({ request }) => {
  const expected = env("STOCK_INGEST_TOKEN");
  if (!expected) {
    return json(503, { error: "ingest disabled: STOCK_INGEST_TOKEN not set" });
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== expected) {
    return json(401, { error: "unauthorized" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid JSON" });
  }

  const uid = str(payload.uid);
  const ts = str(payload.ts) || new Date().toISOString();
  if (!uid) return json(400, { error: "uid is required" });

  await insertStockAlert({
    uid,
    source: str(payload.source) || "BSE",
    symbol: str(payload.symbol),
    headline: str(payload.headline),
    category: str(payload.category),
    url: str(payload.url),
    ts,
    critical: payload.critical === true || payload.critical === 1 || payload.critical === "1",
  });

  return json(200, { ok: true, uid });
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
