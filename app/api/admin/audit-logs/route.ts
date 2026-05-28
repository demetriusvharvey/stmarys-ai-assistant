import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userEmail = searchParams.get("userEmail") || null;
  const action    = searchParams.get("action") || null;
  const limit     = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
  const offset    = parseInt(searchParams.get("offset") || "0", 10);

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (userEmail) {
    params.push(`%${userEmail}%`);
    conditions.push(`user_email ILIKE $${params.length}`);
  }
  if (action) {
    params.push(`%${action}%`);
    conditions.push(`action ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(limit);
  params.push(offset);

  const result = await db.query(
    `SELECT id, user_email, action, route, metadata, created_at
     FROM audit_logs
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM audit_logs ${where}`,
    params.slice(0, params.length - 2)
  );

  return NextResponse.json({
    logs: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
  });
}
