import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { authCore } from "./auth-core";

export const SESSION_COOKIE = "pip_session";

/** Session lookup, verified against the DB once per request (layout and page share the result). */
const validate = cache((token: string) => authCore.validateSession(token));

/** Returns the signed-in user or null. */
export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validate(token);
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
