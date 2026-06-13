import type { APIRoute } from "astro";
import { SESSION_COOKIE } from "../../lib/auth";

export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(SESSION_COOKIE, { path: "/" });
  return redirect("/studio/login");
};

// Visiting /studio/logout directly (GET) just bounces to login.
export const GET: APIRoute = ({ redirect }) => redirect("/studio/login");
