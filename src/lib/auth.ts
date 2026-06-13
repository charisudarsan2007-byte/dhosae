import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { getAdminHash } from "./db";

/**
 * Single-author auth for the private /studio.
 *  - password stored as scrypt hash (never in plaintext)
 *  - session = a stateless cookie signed with HMAC-SHA256(AUTH_SECRET)
 * No third-party service, no database round-trip to validate a session.
 */

export const SESSION_COOKIE = "dhosae_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const s = process.env.AUTH_SECRET ?? (import.meta.env as Record<string, string>).AUTH_SECRET;
  // A weak fallback only matters in local dev; production MUST set AUTH_SECRET.
  return s && s.length >= 16 ? s : "dhosae-dev-secret-change-me-please-32+chars";
}

// ---- password ---------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, want] = parts;
  const got = scryptSync(password, salt, 64);
  const wantBuf = Buffer.from(want, "hex");
  if (got.length !== wantBuf.length) return false;
  return timingSafeEqual(got, wantBuf);
}

// ---- session cookie ---------------------------------------------------------

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSession(): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `admin.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): boolean {
  if (!token) return false;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return false;
  const payload = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  const expected = sign(payload);
  // constant-time compare
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const exp = Number(payload.split(".")[1]);
  return Number.isFinite(exp) && exp > Date.now();
}

export async function checkLogin(password: string): Promise<boolean> {
  const hash = await getAdminHash();
  if (!hash) return false;
  return verifyPassword(password, hash);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: import.meta.env.PROD,
  maxAge: Math.floor(SESSION_TTL_MS / 1000),
};
