import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "smhdc_session";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/ai-tools",   // MCP server and public AI tool endpoints
  "/_next",
  "/favicon.ico",
  "/branding",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function hasInternalSecret(req: NextRequest): boolean {
  const secret = process.env.INTERNAL_ADMIN_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-internal-admin-secret");
  const bearer = req.headers.get("authorization");
  return (
    header === secret ||
    bearer === `Bearer ${secret}`
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // Allow MCP server and service-to-service calls
  if (hasInternalSecret(req)) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
