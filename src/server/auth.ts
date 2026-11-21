import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authCore } from "./auth-core";

export const SESSION_COOKIE = "pip_session";

/** Returns the signed-in user or null. Verified against the DB on every call. */
export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return authCore.validateSession(token);
}

/** Server-side guard for pages and server actions. Never rely on hidden UI alone. */
export async function requireAdmin() {
  const user = await currentUser();
  if (!user || user.role !== "admin") redirect("/login");
  return user;
}

export async function setSessionCookie(token: string, expires: Date) {
  const secure = process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true";
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires });
}

export async function userAgent() {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}
