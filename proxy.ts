import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, type JWTPayload } from "jose";

const COOKIE_NAME = "smhdc_session";

const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/change-password",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/change-password",
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

type AppSessionPayload = JWTPayload & {
  role?: string;
};

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

async function getSessionPayload(req: NextRequest): Promise<AppSessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload as AppSessionPayload;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // Allow MCP server and service-to-service calls
  if (hasInternalSecret(req)) return NextResponse.next();

  const session = await getSessionPayload(req);

  if (isAdminPath(pathname)) {
    if (session?.role === "admin") return NextResponse.next();

    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          success: false,
          error: "Admin role required.",
        },
        { status: 403 }
      );
    }

    if (!session) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.redirect(new URL("/", req.url));
  }

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
