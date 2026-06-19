import type { APIRoute } from "astro";
import { getStockAlerts } from "../../../lib/db";

/**
 * Public read side of the watchtower feed. The /stock page fetches this to show
 * the filings the monitor has alerted on. Read-only, no secrets — safe to be open.
 *   GET /api/stock/feed?limit=30
 */
export const GET: APIRoute = async ({ url }) => {
  const limit = Number(url.searchParams.get("limit") ?? "30");
  const alerts = await getStockAlerts(Number.isFinite(limit) ? limit : 30);
  return new Response(JSON.stringify({ alerts }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // brief edge cache: the feed updates at most once per monitor poll
      "Cache-Control": "public, max-age=15",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
