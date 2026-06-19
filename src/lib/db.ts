import { createClient, type Client } from "@libsql/client";

/**
 * dhosae data layer.
 *
 * Local dev uses a SQLite file (`file:./dhosae.db`). In production point
 * DATABASE_URL at a libSQL/Turso URL and set DATABASE_AUTH_TOKEN — the client
 * is identical (see DEPLOY.md).
 */

function env(key: string): string | undefined {
  // process.env wins at runtime (Vercel/host dashboard); .env covers local dev.
  return process.env[key] ?? (import.meta.env as Record<string, string>)[key];
}

let _client: Client | null = null;
function client(): Client {
  if (_client) return _client;
  _client = createClient({
    url: env("DATABASE_URL") ?? "file:./dhosae.db",
    authToken: env("DATABASE_AUTH_TOKEN"),
  });
  return _client;
}

// ---- one-time schema + seed -------------------------------------------------

let _ready: Promise<void> | null = null;
export function ready(): Promise<void> {
  if (_ready) return _ready;
  _ready = (async () => {
    const db = client();
    await db.batch(
      [
        `CREATE TABLE IF NOT EXISTS posts (
           slug TEXT PRIMARY KEY,
           title TEXT NOT NULL,
           dek TEXT NOT NULL DEFAULT '',
           body TEXT NOT NULL DEFAULT '',
           published_at TEXT NOT NULL,
           reading_minutes INTEGER,
           featured INTEGER NOT NULL DEFAULT 0,
           draft INTEGER NOT NULL DEFAULT 0,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL
         )`,
        `CREATE TABLE IF NOT EXISTS site_content (
           key TEXT PRIMARY KEY,
           value TEXT NOT NULL DEFAULT ''
         )`,
        `CREATE TABLE IF NOT EXISTS admin (
           id INTEGER PRIMARY KEY CHECK (id = 1),
           password_hash TEXT NOT NULL,
           created_at TEXT NOT NULL
         )`,
        // The post-it: one short note per IST calendar day. New day, new blank.
        `CREATE TABLE IF NOT EXISTS notes (
           day TEXT PRIMARY KEY,
           body TEXT NOT NULL DEFAULT '',
           updated_at TEXT NOT NULL
         )`,
        // The watchtower's web feed: every filing the stock monitor alerts on is
        // POSTed here (alongside the ntfy push) so /stock can show it live.
        // Keyed on the exchange's own id (e.g. "BSE:123456") so a re-POST is a no-op.
        `CREATE TABLE IF NOT EXISTS stock_alerts (
           uid TEXT PRIMARY KEY,
           source TEXT NOT NULL DEFAULT 'BSE',
           symbol TEXT NOT NULL DEFAULT '',
           headline TEXT NOT NULL DEFAULT '',
           category TEXT NOT NULL DEFAULT '',
           url TEXT NOT NULL DEFAULT '',
           ts TEXT NOT NULL,
           critical INTEGER NOT NULL DEFAULT 0,
           received_at TEXT NOT NULL
         )`,
      ],
      "write"
    );
    await seedPosts(db);
  })();
  return _ready;
}

// ---- posts ------------------------------------------------------------------

export interface Post {
  slug: string;
  title: string;
  dek: string;
  body: string;
  publishedAt: string; // ISO instant, e.g. 2026-06-14T04:11:00.000Z
  readingMinutes: number | null;
  featured: boolean;
  draft: boolean;
}

/** Reading time from the body, the honest way: words ÷ 200, at least a minute. */
export function readingMinutesFor(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function rowToPost(r: Record<string, unknown>): Post {
  return {
    slug: String(r.slug),
    title: String(r.title),
    dek: String(r.dek ?? ""),
    body: String(r.body ?? ""),
    publishedAt: String(r.published_at),
    readingMinutes: r.reading_minutes == null ? null : Number(r.reading_minutes),
    featured: Number(r.featured) === 1,
    draft: Number(r.draft) === 1,
  };
}

export async function getPosts(opts: { includeDrafts?: boolean } = {}): Promise<Post[]> {
  await ready();
  const sql = opts.includeDrafts
    ? `SELECT * FROM posts ORDER BY published_at DESC`
    : `SELECT * FROM posts WHERE draft = 0 ORDER BY published_at DESC`;
  const res = await client().execute(sql);
  return res.rows.map((r) => rowToPost(r as Record<string, unknown>));
}

export async function getPost(slug: string): Promise<Post | null> {
  await ready();
  const res = await client().execute({
    sql: `SELECT * FROM posts WHERE slug = ?`,
    args: [slug],
  });
  if (res.rows.length === 0) return null;
  return rowToPost(res.rows[0] as Record<string, unknown>);
}

export async function upsertPost(
  p: Omit<Post, "featured" | "draft"> & { featured: boolean; draft: boolean },
  originalSlug?: string
): Promise<void> {
  await ready();
  const now = new Date().toISOString();
  const db = client();

  // If the slug changed, move the row.
  if (originalSlug && originalSlug !== p.slug) {
    await db.execute({ sql: `DELETE FROM posts WHERE slug = ?`, args: [originalSlug] });
  }

  // Reading time is never hand-typed — it's a fact about the body.
  const readingMinutes = readingMinutesFor(p.body);

  await db.execute({
    sql: `INSERT INTO posts (slug, title, dek, body, published_at, reading_minutes, featured, draft, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(slug) DO UPDATE SET
            title=excluded.title, dek=excluded.dek, body=excluded.body,
            published_at=excluded.published_at, reading_minutes=excluded.reading_minutes,
            featured=excluded.featured, draft=excluded.draft, updated_at=excluded.updated_at`,
    args: [
      p.slug,
      p.title,
      p.dek,
      p.body,
      p.publishedAt,
      readingMinutes,
      p.featured ? 1 : 0,
      p.draft ? 1 : 0,
      now,
      now,
    ],
  });
}

export async function deletePost(slug: string): Promise<void> {
  await ready();
  await client().execute({ sql: `DELETE FROM posts WHERE slug = ?`, args: [slug] });
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ---- editable page content (the "why I do it this way" creed, etc.) ---------

export async function getContent(key: string): Promise<string> {
  await ready();
  const res = await client().execute({
    sql: `SELECT value FROM site_content WHERE key = ?`,
    args: [key],
  });
  return res.rows.length ? String(res.rows[0].value) : "";
}

export async function getContentMany(keys: string[]): Promise<Record<string, string>> {
  await ready();
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = "";
  if (keys.length === 0) return out;
  const placeholders = keys.map(() => "?").join(",");
  const res = await client().execute({
    sql: `SELECT key, value FROM site_content WHERE key IN (${placeholders})`,
    args: keys,
  });
  for (const r of res.rows) out[String(r.key)] = String(r.value);
  return out;
}

export async function setContent(entries: Record<string, string>): Promise<void> {
  await ready();
  const db = client();
  const stmts = Object.entries(entries).map(([key, value]) => ({
    sql: `INSERT INTO site_content (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  }));
  if (stmts.length) await db.batch(stmts, "write");
}

// ---- the post-it (daily short-form notes) -----------------------------------
// One row per IST day. The studio shows today's note (blank until written);
// every day before it is kept and browsable. Nothing is ever overwritten by a
// new day — yesterday stays put under its own key.

export interface Note {
  day: string; // "YYYY-MM-DD" in IST
  body: string;
  updatedAt: string; // ISO instant
}

function rowToNote(r: Record<string, unknown>): Note {
  return { day: String(r.day), body: String(r.body ?? ""), updatedAt: String(r.updated_at) };
}

/** Today's (or any day's) note, or null if nothing was written that day. */
export async function getNote(day: string): Promise<Note | null> {
  await ready();
  const res = await client().execute({ sql: `SELECT * FROM notes WHERE day = ?`, args: [day] });
  return res.rows.length ? rowToNote(res.rows[0] as Record<string, unknown>) : null;
}

/** Every note ever written, newest day first. */
export async function getNotes(): Promise<Note[]> {
  await ready();
  const res = await client().execute(`SELECT * FROM notes ORDER BY day DESC`);
  return res.rows.map((r) => rowToNote(r as Record<string, unknown>));
}

/** Save (or clear) a day's note. An empty body deletes the row so it stays tidy. */
export async function setNote(day: string, body: string): Promise<void> {
  await ready();
  const db = client();
  const trimmed = body.trim();
  if (trimmed === "") {
    await db.execute({ sql: `DELETE FROM notes WHERE day = ?`, args: [day] });
    return;
  }
  await db.execute({
    sql: `INSERT INTO notes (day, body, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(day) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
    args: [day, trimmed, new Date().toISOString()],
  });
}

// ---- the watchtower feed (stock monitor → web) ------------------------------
// The Python monitor (stockmon) fans an alert out to ntfy AND to this site's
// /api/stock/ingest, which lands here. /stock and /api/stock/feed read it back.

export interface StockAlert {
  uid: string;
  source: string;
  symbol: string;
  headline: string;
  category: string;
  url: string;
  ts: string; // announcement time, ISO (or whatever the monitor sent)
  critical: boolean;
  receivedAt: string; // when this site ingested it
}

function rowToStockAlert(r: Record<string, unknown>): StockAlert {
  return {
    uid: String(r.uid),
    source: String(r.source ?? "BSE"),
    symbol: String(r.symbol ?? ""),
    headline: String(r.headline ?? ""),
    category: String(r.category ?? ""),
    url: String(r.url ?? ""),
    ts: String(r.ts),
    critical: Number(r.critical) === 1,
    receivedAt: String(r.received_at),
  };
}

/** Newest filings first. Capped so the feed stays light. */
export async function getStockAlerts(limit = 30): Promise<StockAlert[]> {
  await ready();
  const n = Math.max(1, Math.min(100, Math.floor(limit)));
  const res = await client().execute({
    sql: `SELECT * FROM stock_alerts ORDER BY ts DESC, received_at DESC LIMIT ?`,
    args: [n],
  });
  return res.rows.map((r) => rowToStockAlert(r as Record<string, unknown>));
}

/** Record one filing. Re-POSTing the same uid is a harmless no-op (dedup). */
export async function insertStockAlert(
  a: Omit<StockAlert, "receivedAt"> & { receivedAt?: string }
): Promise<void> {
  await ready();
  await client().execute({
    sql: `INSERT INTO stock_alerts (uid, source, symbol, headline, category, url, ts, critical, received_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(uid) DO NOTHING`,
    args: [
      a.uid,
      a.source || "BSE",
      a.symbol || "",
      a.headline || "",
      a.category || "",
      a.url || "",
      a.ts,
      a.critical ? 1 : 0,
      a.receivedAt ?? new Date().toISOString(),
    ],
  });
}

// ---- backup -----------------------------------------------------------------
// Everything you've written, in one plain object — the basis of the studio's
// "download a backup" button. Code lives in git; your words live only here, so
// this is the copy you keep somewhere safe.

export async function exportAll(): Promise<{
  exportedAt: string;
  posts: Post[];
  notes: Note[];
  content: Record<string, string>;
}> {
  await ready();
  const [posts, notes] = await Promise.all([getPosts({ includeDrafts: true }), getNotes()]);
  const res = await client().execute(`SELECT key, value FROM site_content`);
  const content: Record<string, string> = {};
  for (const r of res.rows) content[String(r.key)] = String(r.value);
  return { exportedAt: new Date().toISOString(), posts, notes, content };
}

// ---- admin password ---------------------------------------------------------

export async function hasAdmin(): Promise<boolean> {
  await ready();
  const res = await client().execute(`SELECT 1 FROM admin WHERE id = 1`);
  return res.rows.length > 0;
}

export async function getAdminHash(): Promise<string | null> {
  await ready();
  const res = await client().execute(`SELECT password_hash FROM admin WHERE id = 1`);
  return res.rows.length ? String(res.rows[0].password_hash) : null;
}

export async function setAdminHash(hash: string): Promise<void> {
  await ready();
  await client().execute({
    sql: `INSERT INTO admin (id, password_hash, created_at) VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash`,
    args: [hash, new Date().toISOString()],
  });
}

// ---- seed -------------------------------------------------------------------
// One opening entry, in the journal's own quiet voice, so the place is never
// empty on the first morning. Delete it from the studio whenever you like; it
// won't come back. The standing note is intentionally NOT seeded — you write
// that yourself.

async function seedPosts(db: Client): Promise<void> {
  const existing = await db.execute(`SELECT COUNT(*) AS n FROM posts`);
  const seeded = await db.execute({
    sql: `SELECT value FROM site_content WHERE key = ?`,
    args: ["_seeded"],
  });
  if (Number(existing.rows[0].n) > 0 || seeded.rows.length > 0) return;

  const now = new Date().toISOString();
  for (const p of SEED) {
    await db.execute({
      sql: `INSERT INTO posts (slug, title, dek, body, published_at, reading_minutes, featured, draft, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [p.slug, p.title, p.dek, p.body, p.publishedAt, p.readingMinutes, p.featured ? 1 : 0, now, now],
    });
  }
  await db.execute({
    sql: `INSERT INTO site_content (key, value) VALUES ('_seeded', '1')
          ON CONFLICT(key) DO NOTHING`,
    args: [],
  });
}

const SEED: Array<{
  slug: string;
  title: string;
  dek: string;
  publishedAt: string;
  readingMinutes: number;
  featured: boolean;
  body: string;
}> = [
  {
    slug: "why-im-keeping-this",
    title: "Why I'm keeping this",
    dek: "A note, before the first real day.",
    // A fixed instant near the morning the place went up (IST ~6:10am).
    publishedAt: "2026-06-14T00:40:00.000Z",
    readingMinutes: 2,
    featured: false,
    body: `In 2005, standing in front of a few thousand graduates, Steve Jobs said that for the past thirty-three years he had looked in the mirror every morning and asked himself one question: *if today were the last day of my life, would I want to do what I am about to do today?* Whenever the answer had been "no" for too many days in a row, he knew he needed to change something.

This is my version of that mirror.

Every entry here is one day, written as if it might be the last one. Not to be morbid — the opposite. Remembering that the time runs out is the fastest way I know to clear off the noise: the fear of looking foolish, the small vanities, the endless someday-laters. What's left after that is usually the only thing worth doing.

So this won't be polished. Some days will be a single line, written late, half-awake. That's allowed. I would rather keep honest days than impressive ones.

If you've found your way here — start with today. The rest will keep.`,
  },
];
