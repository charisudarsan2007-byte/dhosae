import { defineMiddleware } from "astro:middleware";
import { SESSION_COOKIE, verifySession } from "./lib/auth";
import { hasAdmin } from "./lib/db";

/**
 * Guards the private studio.
 *  - Before any password exists -> force /studio/setup (create your access).
 *  - After it exists -> /studio/login is the only open door; everything else
 *    under /studio requires a valid session cookie.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!pathname.startsWith("/studio")) return next();

  const loggedIn = verifySession(context.cookies.get(SESSION_COOKIE)?.value);
  const adminExists = await hasAdmin();

  const isSetup = pathname === "/studio/setup";
  const isLogin = pathname === "/studio/login";

  // No account yet: only the setup page is reachable.
  if (!adminExists) {
    if (isSetup) return next();
    return context.redirect("/studio/setup");
  }

  // Account exists: setup is closed.
  if (isSetup) return context.redirect(loggedIn ? "/studio" : "/studio/login");

  // Already signed in and visiting the login page: skip it.
  if (isLogin && loggedIn) return context.redirect("/studio");

  // The login page is the only open door.
  if (isLogin) return next();

  if (!loggedIn) return context.redirect("/studio/login");

  return next();
});
