import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { sendKnowledgeGapAlert } from "@/lib/mailer";

export const runtime = "nodejs";

async function requireAdmin() {
  const session = await getSession();
  return session?.role === "admin" ? session : null;
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "open";
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);

  const result = await db.query(
    `SELECT id, question, user_email, agent, flagged_at, status, notes, resolved_at, resolved_by
     FROM knowledge_gaps
     WHERE ($1 = 'all' OR status = $1)
     ORDER BY flagged_at DESC
     LIMIT $2`,
    [status, limit]
  ).catch(() => ({ rows: [] }));

  const countResult = await db.query(
    `SELECT status, COUNT(*) as count FROM knowledge_gaps GROUP BY status`
  ).catch(() => ({ rows: [] }));

  const counts: Record<string, number> = {};
  for (const row of countResult.rows) {
    counts[row.status] = parseInt(row.count, 10);
  }

  return NextResponse.json({ gaps: result.rows, counts });
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, status, notes } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 });
  const VALID_STATUSES = ["open", "resolved", "ignored"];
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status. Must be: open, resolved, or ignored" }, { status: 400 });
  }

  await db.query(
    `UPDATE knowledge_gaps SET status = $1, notes = COALESCE($2, notes),
     resolved_at = CASE WHEN $1 != 'open' THEN now() ELSE NULL END,
     resolved_by = CASE WHEN $1 != 'open' THEN $3 ELSE NULL END
     WHERE id = $4`,
    [status, notes || null, session.email || "admin", id]
  );

  return NextResponse.json({ success: true });
}

export async function POST(_req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await db.query(
    `SELECT question, user_email, agent, flagged_at FROM knowledge_gaps
     WHERE status = 'open' ORDER BY flagged_at DESC LIMIT 50`
  ).catch(() => ({ rows: [] }));

  if (result.rows.length === 0) {
    return NextResponse.json({ message: "No open knowledge gaps to report" });
  }

  try {
    await sendKnowledgeGapAlert({ gaps: result.rows });
    return NextResponse.json({ success: true, sent: result.rows.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
