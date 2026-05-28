import { NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/mcp/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!verifyInternalSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const userEmail = searchParams.get("userEmail") || null;
  const search    = searchParams.get("search") || null;
  const limit     = Math.min(parseInt(searchParams.get("limit") || "25", 10), 100);

  try {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (userEmail) {
      params.push(`%${userEmail}%`);
      conditions.push(`user_email ILIKE $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`question ILIKE $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const dataParams = [...params, limit];

    const result = await db.query(
      `SELECT id, user_email, question, answer, created_at
       FROM audit_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${dataParams.length}`,
      dataParams
    );

    return NextResponse.json({ logs: result.rows, count: result.rows.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
