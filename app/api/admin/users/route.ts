import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/mailer";

export const runtime = "nodejs";

// GET /api/admin/users — list all users (admin only)
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await db.query(
    `SELECT id, email, display_name, role, is_active, created_at, last_login_at
     FROM users
     ORDER BY created_at DESC`
  );

  return NextResponse.json({ users: result.rows });
}

// POST /api/admin/users — create a new user (admin only)
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, display_name, role, password } = body;

  if (!email || !display_name || !role || !password) {
    return NextResponse.json(
      { error: "email, display_name, role, and password are required" },
      { status: 400 }
    );
  }

  if (!["staff", "it_staff", "admin"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await db.query(
      `INSERT INTO users (email, display_name, role, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, email, display_name, role, is_active, created_at`,
      [email.toLowerCase().trim(), display_name.trim(), role, passwordHash]
    );

    const user = result.rows[0];

    // Send welcome email — non-fatal if SMTP isn't configured yet
    let emailSent = false;
    let emailError: string | null = null;
    try {
      await sendWelcomeEmail({
        to: user.email,
        displayName: display_name.trim(),
        tempPassword: password,
        role,
      });
      emailSent = true;
    } catch (mailErr: any) {
      emailError = mailErr.message ?? "Email sending failed";
      console.warn("[users] Welcome email failed:", emailError);
    }

    return NextResponse.json({ user, emailSent, emailError }, { status: 201 });
  } catch (err: any) {
    if (err.code === "23505") {
      return NextResponse.json(
        { error: "An account with that email already exists" },
        { status: 409 }
      );
    }
    throw err;
  }
}
