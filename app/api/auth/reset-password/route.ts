import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { token, newPassword } = await req.json();

  if (!token || !newPassword) {
    return NextResponse.json({ error: "token and newPassword are required" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const result = await db.query(
    `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
     FROM password_reset_tokens prt
     WHERE prt.token = $1`,
    [token]
  );

  const row = result.rows[0];
  if (!row) {
    return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
  }
  if (row.used_at) {
    return NextResponse.json({ error: "This reset link has already been used." }, { status: 400 });
  }
  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 });
  }

  const hash = await bcrypt.hash(newPassword, 12);

  await db.query(
    `UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2`,
    [hash, row.user_id]
  );

  await db.query(
    `UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`,
    [row.id]
  );

  return NextResponse.json({ ok: true });
}
