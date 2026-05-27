import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminSessionToken } from "@/lib/adminSession";

const PROTECTED_PREFIXES = [
  "/admin",
  "/api/admin",
  "/api/ai-tools",
  "/api/sharepoint/sync",
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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/api/feedback" && req.method === "POST") {
    return NextResponse.next();
  }

  if (pathname === "/api/documents" && req.method === "GET") {
    return NextResponse.next();
  }

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

  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const internalSecretHeader = req.headers.get("x-internal-admin-secret");

  const hasValidSession = sessionCookie
    ? await verifyAdminSessionToken(sessionCookie, adminSecret)
    : false;

  if (hasValidSession || bearerToken === adminSecret || internalSecretHeader === adminSecret) {
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
