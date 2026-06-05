import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Always return success to prevent email enumeration
  const result = await db.query(
    `SELECT id, display_name, is_active FROM users WHERE email = $1 LIMIT 1`,
    [email.toLowerCase().trim()]
  );

  const user = result.rows[0];
  if (!user || !user.is_active) {
    return NextResponse.json({ ok: true });
  }

  // Invalidate old tokens
  await db.query(
    `UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
    [user.id]
  );

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [user.id, token, expiresAt]
  );

  // Send email if SMTP is configured
  try {
    const { sendPasswordResetLinkEmail } = await import("@/lib/mailer");
    const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;
    await sendPasswordResetLinkEmail({ to: email, displayName: user.display_name, resetUrl });
  } catch (err) {
    console.warn("[forgot-password] Email not sent:", (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
