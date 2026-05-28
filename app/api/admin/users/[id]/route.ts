import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// PATCH /api/admin/users/[id] — update role, active status, or reset password
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { is_active, role, new_password } = body;

  // Prevent admin from deactivating their own account
  if (session.id === id && is_active === false) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account" },
      { status: 400 }
    );
  }

  if (new_password !== undefined) {
    if (new_password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    const passwordHash = await bcrypt.hash(new_password, 12);
    await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
      passwordHash,
      id,
    ]);
  }

  if (is_active !== undefined) {
    await db.query(`UPDATE users SET is_active = $1 WHERE id = $2`, [
      is_active,
      id,
    ]);
  }

  if (role !== undefined) {
    if (!["staff", "it_staff", "admin"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    await db.query(`UPDATE users SET role = $1 WHERE id = $2`, [role, id]);
  }

  const result = await db.query(
    `SELECT id, email, display_name, role, is_active, created_at, last_login_at
     FROM users WHERE id = $1`,
    [id]
  );

  return NextResponse.json({ user: result.rows[0] });
}
