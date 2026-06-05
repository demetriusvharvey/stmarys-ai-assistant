import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSessionCookie, COOKIE_NAME, MAX_AGE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const result = await db.query(
      `SELECT id, email, display_name, role, password_hash, must_change_password
       FROM users
       WHERE email = $1 AND is_active = true
       LIMIT 1`,
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
    }

    await db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);

    const token = await createSessionCookie({
      id: user.id,
      email: user.email,
      name: user.display_name,
      role: user.role,
    });

    const response = NextResponse.json({
      ok: true,
      mustChangePassword: Boolean(user.must_change_password),
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
