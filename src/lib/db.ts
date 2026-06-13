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
  publishedAt: string; // YYYY-MM-DD
  readingMinutes: number | null;
  featured: boolean;
  draft: boolean;
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
      p.readingMinutes,
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
// The five launch pieces, so the site is never empty. You can edit or delete
// any of them from the studio. The creed is intentionally NOT seeded — you
// write "why I do it this way" yourself.

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
    slug: "the-only-numbers-that-matter",
    title: "The only three numbers that actually move a business",
    dek: "Revenue is vanity, profit is sanity, but cash flow is the one that pays rent. A field guide to ignoring the other forty metrics on your dashboard.",
    publishedAt: "2026-06-09",
    readingMinutes: 7,
    featured: true,
    body: `Most dashboards are decorated panic. Forty tiles, twelve colours, and not one of them tells you whether the business survives the next quarter.

Strip it back. Three numbers carry the weight.

## 1. Cash runway

Not revenue. Not bookings. The number of months before the bank balance hits zero at the current burn. Everything else is a story you tell investors; runway is the story physics tells you.

## 2. Contribution margin

What's left from one more sale after the costs that *only* exist because you made that sale. If this is negative, growth is a way to lose money faster — and you'd be amazed how many "rocket ships" are exactly that.

## 3. The payback period

How long until a customer returns the cash you spent to acquire them. Under twelve months and you can press the accelerator. Over twenty-four and you're financing strangers' habits with your own equity.

Everything else — DAUs, NPS, "engagement" — is downstream of these or it's noise. Big brain, big stuff. The rest is decoration.`,
  },
  {
    slug: "inflation-is-a-story",
    title: "Inflation is a story the economy tells itself",
    dek: "Prices don't rise because of one villain. They rise because millions of people start believing they will — and then act on it. Expectations are the real engine.",
    publishedAt: "2026-05-28",
    readingMinutes: 9,
    featured: false,
    body: `Ask ten people why prices go up and you'll get ten villains: money printing, greedy corporations, oil, wages, the government. Each is real on some Tuesday. None is the whole machine.

The machine is **expectations**.

When enough people believe prices will be higher next year, they behave as if they already are. Workers ask for more. Firms raise prices pre-emptively. Lenders demand fatter rates. The belief manufactures the outcome — a prophecy that funds itself.

This is why central banks spend most of their energy not on interest rates but on *credibility*. The rate is the lever; the belief is the gearbox. A central bank that is trusted barely has to move. One that isn't can hike into a wall and watch prices keep climbing.

So when you read the next inflation print, don't just ask *what happened to prices*. Ask the bigger question: **what does everyone now expect to happen next?** That's the number that hasn't been published yet — and it's the one that matters.`,
  },
  {
    slug: "moats-are-mostly-myth",
    title: "Most 'moats' are just a head start with good PR",
    dek: "Network effects, brand, switching costs — the canon of defensibility. Useful, until founders mistake a temporary lead for a permanent wall.",
    publishedAt: "2026-05-15",
    readingMinutes: 6,
    featured: false,
    body: `Every pitch deck has a slide titled "Why we win." It lists a moat. It is usually wrong — not because moats don't exist, but because *speed* is wearing their clothes.

A real moat compounds while you sleep. A fake one needs you to keep running.

- **Network effects** are real when each user makes the product better for the next. They're fake when you're just buying both sides of the market.
- **Brand** is real when customers pay more for the same thing. It's fake when it's only awareness.
- **Switching costs** are real when leaving genuinely hurts. They're fake when they're just a clunky export button you haven't been forced to fix.

The honest version of the slide says: *we are eighteen months ahead and we intend to use them to build something that's actually hard to copy.* That's not weakness. That's the only strategy that survives contact with a competitor who read the same playbook.`,
  },
  {
    slug: "the-risk-you-cannot-see",
    title: "The risk you can't see on the spreadsheet",
    dek: "Correlation hides until the day everything needs it most. Why diversification fails exactly when you're counting on it.",
    publishedAt: "2026-04-30",
    readingMinutes: 8,
    featured: false,
    body: `Diversification is a promise that your bets won't all fail at once. The fine print: *probably, on a normal day.*

The trouble is that crises are not normal days. In calm markets, assets drift apart and your spreadsheet reports comforting low correlations. Then stress arrives, everyone reaches for cash at the same moment, and correlations snap to one. The diversification you paid for evaporates precisely when you wanted to withdraw it.

This is the risk no column captures: the risk that your *model of risk* is itself a fair-weather friend.

The fix isn't a better correlation matrix. It's humility built into the structure — keep enough dry powder that you never become a forced seller, and size positions so that being wrong is survivable, not just unlikely. The market can stay irrational longer than you can stay solvent, and solvency is the only score that counts at the end.`,
  },
  {
    slug: "compounding-is-boring-on-purpose",
    title: "Compounding is boring on purpose",
    dek: "The most powerful force in finance looks like nothing is happening — right up until everything is. A note on patience as a strategy.",
    publishedAt: "2026-04-12",
    readingMinutes: 5,
    featured: false,
    body: `Compounding has a marketing problem: for most of its life it looks like failure.

A 15% annual return turns ₹1 into ₹4 over a decade and into ₹16 over two. The second decade does *four times* the work of the first, for the same patience. But the first decade is where everyone quits, because the curve is still flat enough to feel like standing still.

The lesson isn't "wait." It's *survive the boring part without doing something clever.* Most damage to long-term returns is self-inflicted — a panic sell, a hot tip, a clever rotation that resets the clock.

Big results come from small edges, held for an unreasonable amount of time. The math is not complicated. The behaviour is the entire game.`,
  },
];
