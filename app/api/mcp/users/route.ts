import { NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/mcp/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!verifyInternalSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db.query(
      `SELECT id, email, display_name, role, is_active, created_at, last_login_at
       FROM users
       ORDER BY display_name ASC`
    );
    return NextResponse.json({ users: result.rows });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
