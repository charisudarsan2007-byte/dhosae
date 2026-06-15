/**
 * Time is the spine of dhosae — every entry is one day, stamped with the
 * hour it was written. All display is rendered in India Standard Time
 * (Asia/Kolkata, a fixed +05:30, no daylight saving), wherever the server runs.
 */

const TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST wall-clock hour (0–23) and zero-padded minute for an instant. */
function istClock(d: Date): { hour: number; minute: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return { hour, minute };
}

/** "Sunday, 14 June 2026" */
export function formatDay(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** "14 Jun 2026" — compact, for lists. */
export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** "9.41 in the morning" — the hour written the way you'd say it aloud. */
export function formatTime(d: Date): string {
  const { hour, minute } = istClock(d);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  let phase: string;
  if (hour < 5) phase = "at night";
  else if (hour < 12) phase = "in the morning";
  else if (hour < 17) phase = "in the afternoon";
  else if (hour < 21) phase = "in the evening";
  else phase = "at night";
  return `${h12}.${minute} ${phase}`;
}

/** "14.41" — bare 24h clock, for tight meta lines. */
export function formatClock(d: Date): string {
  const { hour, minute } = istClock(d);
  return `${String(hour).padStart(2, "0")}.${minute}`;
}

/** Full human stamp: "Sunday, 14 June 2026 · 9.41 in the morning" */
export function formatStamp(d: Date): string {
  return `${formatDay(d)} · ${formatTime(d)}`;
}

/** The IST calendar day as a stable key, "YYYY-MM-DD" — the post-it's identity. */
export function istDayKey(d: Date = new Date()): string {
  // en-CA renders ISO-ordered date parts; in Asia/Kolkata this is the IST day.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "Sunday, 14 June 2026" for a "YYYY-MM-DD" key, read at IST noon to avoid edge slips. */
export function formatDayKey(key: string): string {
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return key;
  const [, y, mo, d] = m;
  // Noon IST -> a safe instant inside that calendar day in every zone.
  const at = new Date(Date.UTC(+y, +mo - 1, +d, 12, 0) - IST_OFFSET_MS);
  return formatDay(at);
}

/* ---- studio <-> ISO conversion ---------------------------------------------
   The studio uses an <input type="datetime-local">, whose value is a bare
   "YYYY-MM-DDTHH:MM" with no zone. We treat that wall-clock as IST in both
   directions, so the author sees and sets the time they actually mean. */

/** ISO instant -> "YYYY-MM-DDTHH:MM" in IST, for prefilling datetime-local. */
export function toLocalInput(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  // Shift into IST then read the UTC fields to get IST wall-clock digits.
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:MM" (read as IST) -> ISO instant. Falls back to now. */
export function fromLocalInput(local: string): string {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  const [, y, mo, d, h, mi] = m;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi) - IST_OFFSET_MS;
  return new Date(ms).toISOString();
}
