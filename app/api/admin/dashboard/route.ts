import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [
      totalQuestions,
      questionsToday,
      questionsThisWeek,
      activeUsers,
      topQuestions,
      agentBreakdown,
      dailyVolume,
      topUsers,
    ] = await Promise.all([
      // Total questions ever
      db.query(`SELECT COUNT(*) AS count FROM audit_logs`),

      // Questions today
      db.query(`
        SELECT COUNT(*) AS count FROM audit_logs
        WHERE created_at >= CURRENT_DATE
      `),

      // Questions this week
      db.query(`
        SELECT COUNT(*) AS count FROM audit_logs
        WHERE created_at >= date_trunc('week', now())
      `),

      // Unique active users (last 30 days)
      db.query(`
        SELECT COUNT(DISTINCT user_email) AS count FROM audit_logs
        WHERE created_at >= now() - interval '30 days'
        AND user_email IS NOT NULL
      `),

      // Top questions (most common keywords — recent 500)
      db.query(`
        SELECT question, COUNT(*) AS count
        FROM audit_logs
        WHERE question IS NOT NULL
        AND created_at >= now() - interval '30 days'
        GROUP BY question
        ORDER BY count DESC
        LIMIT 10
      `),

      // Agent breakdown — parse agent from answer metadata via retrieved_sources
      db.query(`
        SELECT
          COALESCE(
            retrieved_sources::jsonb->>'agent',
            'unknown'
          ) AS agent,
          COUNT(*) AS count
        FROM audit_logs
        WHERE created_at >= now() - interval '30 days'
        GROUP BY agent
        ORDER BY count DESC
        LIMIT 15
      `),

      // Daily volume for last 14 days
      db.query(`
        SELECT
          DATE(created_at) AS day,
          COUNT(*) AS count
        FROM audit_logs
        WHERE created_at >= now() - interval '14 days'
        GROUP BY day
        ORDER BY day ASC
      `),

      // Top users last 30 days
      db.query(`
        SELECT user_email, COUNT(*) AS count
        FROM audit_logs
        WHERE user_email IS NOT NULL
        AND created_at >= now() - interval '30 days'
        GROUP BY user_email
        ORDER BY count DESC
        LIMIT 10
      `),
    ]);

    // Total users and recent logins from users table
    const usersStats = await db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE is_active = true) AS active,
        COUNT(*) FILTER (WHERE last_login_at >= now() - interval '7 days') AS logged_in_this_week
      FROM users
    `);

    return NextResponse.json({
      stats: {
        totalQuestions: parseInt(totalQuestions.rows[0].count),
        questionsToday: parseInt(questionsToday.rows[0].count),
        questionsThisWeek: parseInt(questionsThisWeek.rows[0].count),
        activeUsers: parseInt(activeUsers.rows[0].count),
        totalUsers: parseInt(usersStats.rows[0].total),
        activeUserAccounts: parseInt(usersStats.rows[0].active),
        loggedInThisWeek: parseInt(usersStats.rows[0].logged_in_this_week),
      },
      topQuestions: topQuestions.rows,
      agentBreakdown: agentBreakdown.rows,
      dailyVolume: dailyVolume.rows,
      topUsers: topUsers.rows,
    });
  } catch (error: any) {
    console.error("[dashboard]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
