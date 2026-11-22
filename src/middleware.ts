import { NextResponse, type NextRequest } from "next/server";

/**
 * Convenience redirect only. Real authorization happens server-side in
 * requireAdmin() on every page, server action and API route.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const open = pathname.startsWith("/login") || pathname.startsWith("/setup") || pathname.startsWith("/api/setup") || pathname.startsWith("/api/auth") || pathname.startsWith("/api/cron") || pathname === "/api/health" || pathname.startsWith("/_next") || pathname === "/favicon.ico";
  if (open) return NextResponse.next();
  if (!req.cookies.get("pip_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone(); url.pathname = "/login"; url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
