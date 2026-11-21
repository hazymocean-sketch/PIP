import { NextResponse, type NextRequest } from "next/server";
import { authCore } from "@/server/auth-core";
import { SESSION_COOKIE } from "@/server/auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await authCore.logout(token);
  const r = NextResponse.redirect(new URL("/login", req.url), 303);
  r.cookies.delete(SESSION_COOKIE);
  return r;
}
