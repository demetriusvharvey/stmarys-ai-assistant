import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { verifyAdminSessionToken } from "@/lib/adminSession";

const COOKIE_NAME = "smhdc_session";
const ADMIN_COOKIE_NAME = "stmarys_admin_session";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/ai-tools",   // MCP server and public AI tool endpoints
  "/_next",
  "/favicon.ico",
  "/branding",
];

const ADMIN_PUBLIC_PATHS = [
  "/admin/login",
  "/api/admin/login",
];

const ADMIN_PATHS = [
  "/admin",
  "/api/admin",
  "/api/feedback/list",
];

function isPublic(pathname: string) {
  return (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    ADMIN_PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  );
}

function isAdminPath(pathname: string) {
  return ADMIN_PATHS.some((p) => pathname.startsWith(p));
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

async function hasAdminSession(req: NextRequest): Promise<boolean> {
  const secret = process.env.INTERNAL_ADMIN_SECRET;
  if (!secret) return false;

  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;

  return verifyAdminSessionToken(token, secret);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // Allow MCP server and service-to-service calls
  if (hasInternalSecret(req)) return NextResponse.next();

  if (isAdminPath(pathname)) {
    if (await hasAdminSession(req)) return NextResponse.next();

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          success: false,
          error: "Admin access required.",
        },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/admin/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

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
