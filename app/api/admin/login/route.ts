import { NextResponse } from "next/server";
import { createAdminSessionToken } from "@/lib/adminSession";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const password = body.password;

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

    if (password !== adminSecret) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid password.",
        },
        { status: 401 }
      );
    }

    const sessionToken = await createAdminSessionToken(adminSecret);
    const response = NextResponse.json({
      success: true,
    });

    response.cookies.set(
      "stmarys_admin_session",
      sessionToken,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      }
    );

    return response;
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Login failed.",
      },
      { status: 500 }
    );
  }
}
