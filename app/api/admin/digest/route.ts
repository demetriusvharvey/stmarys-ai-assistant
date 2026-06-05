import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildWeeklyDigestEmail, sendWeeklyDigest } from "@/lib/mailer";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

async function gatherStats() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [totalQ, activeUsers, gaps, topQ, topAgents, newGaps] = await Promise.all([
    db.query(`SELECT COUNT(*) as count FROM audit_logs WHERE created_at > $1`, [weekAgo]),
    db.query(`SELECT COUNT(DISTINCT user_email) as count FROM audit_logs WHERE created_at > $1 AND user_email IS NOT NULL`, [weekAgo]),
    db.query(`SELECT COUNT(*) as count FROM knowledge_gaps WHERE flagged_at > $1 AND status = 'open'`, [weekAgo]).catch(() => ({ rows: [{ count: 0 }] })),
    db.query(
      `SELECT question, COUNT(*) as count FROM audit_logs WHERE created_at > $1 AND question IS NOT NULL GROUP BY question ORDER BY count DESC LIMIT 10`,
      [weekAgo]
    ),
    db.query(
      `SELECT agent, COUNT(*) as count FROM knowledge_gaps WHERE flagged_at > $1 AND agent IS NOT NULL GROUP BY agent ORDER BY count DESC LIMIT 8`,
      [weekAgo]
    ).catch(() => ({ rows: [] })),
    db.query(
      `SELECT question, user_email, flagged_at FROM knowledge_gaps WHERE flagged_at > $1 ORDER BY flagged_at DESC LIMIT 10`,
      [weekAgo]
    ).catch(() => ({ rows: [] })),
  ]);

  return {
    totalQuestions: parseInt(totalQ.rows[0]?.count || "0", 10),
    activeUsers: parseInt(activeUsers.rows[0]?.count || "0", 10),
    knowledgeGaps: parseInt(gaps.rows[0]?.count || "0", 10),
    topQuestions: topQ.rows.map((r) => ({ question: r.question, count: parseInt(r.count, 10) })),
    topAgents: topAgents.rows.filter(r => r.agent).map((r) => ({ agent: r.agent, count: parseInt(r.count, 10) })),
    newGaps: newGaps.rows,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get("preview") === "html") {
    const session = await getSession();
    if (session?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const stats = await gatherStats();
    const email = buildWeeklyDigestEmail(stats);
    return new NextResponse(email.html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const secret = searchParams.get("secret");
  const expected = process.env.DIGEST_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runDigest();
}

export async function POST(_req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return runDigest();
}

async function runDigest() {
  try {
    const adminUsers = await db.query(
      `SELECT email FROM users WHERE role = 'admin' AND is_active = true`
    );

    if (adminUsers.rows.length === 0) {
      return NextResponse.json({ message: "No admin users found" });
    }

    const stats = await gatherStats();
    const results: { email: string; sent: boolean; error?: string }[] = [];

    for (const user of adminUsers.rows) {
      try {
        await sendWeeklyDigest({ to: user.email, stats });
        results.push({ email: user.email, sent: true });
      } catch (err: any) {
        results.push({ email: user.email, sent: false, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      sent: results.filter((r) => r.sent).length,
      total: results.length,
      stats: { totalQuestions: stats.totalQuestions, activeUsers: stats.activeUsers, knowledgeGaps: stats.knowledgeGaps },
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
