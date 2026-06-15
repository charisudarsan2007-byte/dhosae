import type { APIRoute } from "astro";
import { exportAll } from "../../lib/db";
import { istDayKey } from "../../lib/format";

/**
 * Your words, in one file. Code lives in git; the writing lives only in the
 * database — so this is the real backup. Download it now and then, keep it
 * somewhere safe. (Gated by the studio middleware like everything else here.)
 */
export const GET: APIRoute = async () => {
  const data = await exportAll();
  const body = JSON.stringify(data, null, 2);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dhosae-backup-${istDayKey()}.json"`,
      "Cache-Control": "no-store",
    },
  });
};
