import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/admin",
  "/api/sharepoint",
  "/api/ingest",
  "/api/ingest-pdf",
  "/api/documents",
  "/api/feedback",
];

const PUBLIC_ROUTES = [
  "/admin/login",
  "/api/admin/login",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (isPublic) {
    return NextResponse.next();
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const sessionCookie =
    req.cookies.get("stmarys_admin_session")?.value;

  const adminSecret =
    process.env.INTERNAL_ADMIN_SECRET;

  if (!adminSecret) {
    return NextResponse.json(
      {
        success: false,
        error: "Server auth is not configured.",
      },
      { status: 500 }
    );
  }

  if (sessionCookie === adminSecret) {
    return NextResponse.next();
  }

  const loginUrl = new URL(
    "/admin/login",
    req.url
  );

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};