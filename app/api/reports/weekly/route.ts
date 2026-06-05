/**
 * Weekly Accomplishment Report — broadcasts to all active users.
 * Focuses strictly on tasks and tickets. No email content. No chat history.
 *
 * Triggered by:
 *   GET /api/reports/weekly?secret=REPORT_SECRET          (cron)
 *   POST /api/reports/weekly                              (admin manual)
 *   GET /api/reports/weekly?preview=1&email=you@smhdc.org (admin preview)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGraphAccessToken } from "@/lib/microsoftGraph";
import { openai } from "@/lib/openai";
import { db } from "@/lib/db";
import nodemailer from "nodemailer";
import { deIdentifyText } from "@/lib/phi/deidentify";

export const runtime = "nodejs";
export const maxDuration = 300;

function scrub(t: string | null | undefined) {
  return t ? deIdentifyText(t).cleanText : "";
}

// ── Graph helpers ─────────────────────────────────────────────────────────────

async function graphGet(token: string, url: string) {
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) return { value: [] };
  return res.json().catch(() => ({ value: [] }));
}

async function getUserMeetingCount(token: string, email: string, since: Date, now: Date) {
  try {
    const data = await graphGet(token,
      "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) +
      "/calendarView?startDateTime=" + since.toISOString() +
      "&endDateTime=" + now.toISOString() +
      "&$select=subject,isAllDay&$top=50"
    );
    return (data.value ?? []).filter((e: any) => !e.isAllDay).length;
  } catch { return 0; }
}

async function getUserTasks(token: string, email: string) {
  const completed: string[] = [];
  const open: { title: string; overdue: boolean; listName: string }[] = [];
  try {
    const lists = await graphGet(token,
      "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) + "/todo/lists"
    );
    for (const list of (lists.value ?? []).slice(0, 5)) {
      const [done, pending] = await Promise.all([
        graphGet(token,
          "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) +
          "/todo/lists/" + list.id +
          "/tasks?$filter=status eq 'completed'&$select=title,completedDateTime&$top=20"
        ),
        graphGet(token,
          "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) +
          "/todo/lists/" + list.id +
          "/tasks?$filter=status ne 'completed'&$select=title,dueDateTime,importance&$top=20"
        ),
      ]);
      for (const t of (done.value ?? [])) completed.push(scrub(t.title));
      for (const t of (pending.value ?? [])) {
        const overdue = t.dueDateTime?.dateTime ? new Date(t.dueDateTime.dateTime) < new Date() : false;
        open.push({ title: scrub(t.title), overdue, listName: list.displayName });
      }
    }
  } catch { /* skip */ }
  return { completed, open };
}

async function getUserPlannerTasks(token: string, email: string) {
  const completed: string[] = [];
  const open: { title: string; overdue: boolean; pct: number }[] = [];
  try {
    const user = await graphGet(token,
      "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) + "?$select=id"
    );
    const tasks = await graphGet(token,
      "https://graph.microsoft.com/v1.0/users/" + user.id + "/planner/tasks?$select=title,dueDateTime,percentComplete,priority"
    );
    for (const t of (tasks.value ?? [])) {
      if (t.percentComplete === 100) {
        completed.push(scrub(t.title));
      } else {
        const overdue = t.dueDateTime ? new Date(t.dueDateTime) < new Date() : false;
        open.push({ title: scrub(t.title), overdue, pct: t.percentComplete ?? 0 });
      }
    }
  } catch { /* skip */ }
  return { completed, open };
}

async function getUserIssuetrakTickets(email: string) {
  const closed: string[] = [];
  const open: string[] = [];
  if (process.env.ISSUETRAK_ENABLED !== "true") return { closed, open };
  const base = process.env.ISSUETRAK_BASE_URL;
  const key = process.env.ISSUETRAK_API_KEY;
  if (!base || !key) return { closed, open };
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const headers = { "Authorization": "Bearer " + key };
    const [closedRes, openRes] = await Promise.all([
      fetch(base + "/api/v2/Issues?submitterEmail=" + encodeURIComponent(email) + "&status=closed&modifiedAfter=" + since, { headers }),
      fetch(base + "/api/v2/Issues?submitterEmail=" + encodeURIComponent(email) + "&status=open", { headers }),
    ]);
    const closedData = closedRes.ok ? await closedRes.json() : { value: [] };
    const openData = openRes.ok ? await openRes.json() : { value: [] };
    for (const t of (closedData.value ?? closedData ?? [])) closed.push("#" + (t.IssueNumber || t.id) + ": " + scrub(t.Subject || t.subject || ""));
    for (const t of (openData.value ?? openData ?? [])) open.push("#" + (t.IssueNumber || t.id) + ": " + scrub(t.Subject || t.subject || ""));
  } catch { /* skip */ }
  return { closed, open };
}

// ── Report generator for one user ─────────────────────────────────────────────

async function buildUserReport(
  token: string,
  user: { email: string; name: string },
  since: Date,
  now: Date,
  dateRange: string
) {
  const [meetings, todo, planner, tickets] = await Promise.all([
    getUserMeetingCount(token, user.email, since, now),
    getUserTasks(token, user.email),
    getUserPlannerTasks(token, user.email),
    getUserIssuetrakTickets(user.email),
  ]);

  // Build task summary for AI
  const completedItems = [
    ...todo.completed.map(t => "✅ [To-Do] " + t),
    ...planner.completed.map(t => "✅ [Planner] " + t),
    ...tickets.closed.map(t => "✅ [IT Ticket] " + t),
  ];

  const openItems = [
    ...todo.open.map(t => (t.overdue ? "⚠️ OVERDUE" : "•") + " [To-Do] " + t.title + (t.overdue ? " — OVERDUE" : "")),
    ...planner.open.map(t => (t.overdue ? "⚠️ OVERDUE" : "•") + " [Planner] " + t.title + (t.pct > 0 ? " (" + t.pct + "% done)" : "") + (t.overdue ? " — OVERDUE" : "")),
    ...tickets.open.map(t => "• [IT Ticket] " + t),
  ];

  const hasSomething = completedItems.length > 0 || openItems.length > 0 || meetings > 0;
  if (!hasSomething) return null; // Skip users with no activity

  const prompt = [
    "Write a brief, encouraging weekly work report for " + user.name + " at St. Mary's Home for Disabled Children.",
    "Report period: " + dateRange,
    "",
    "COMPLETED THIS WEEK:",
    completedItems.length > 0 ? completedItems.join("\n") : "No completed tasks recorded.",
    "",
    "OUTSTANDING / OPEN ITEMS:",
    openItems.length > 0 ? openItems.join("\n") : "No open items.",
    "",
    "MEETINGS ATTENDED: " + meetings,
    "",
    "Write 3 short sections:",
    "1. **🏆 Completed This Week** — list what was accomplished",
    "2. **📋 Still In Progress / Outstanding** — what needs attention next week; call out overdue items clearly",
    "3. **📌 Focus for Next Week** — 2–3 specific recommended priorities based on open items",
    "",
    "Keep it under 300 words. Professional, supportive tone. Use markdown.",
  ].join("\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    max_tokens: 600,
  });

  return completion.choices[0]?.message?.content ?? null;
}

// ── Email sender ───────────────────────────────────────────────────────────────

function buildEmailHtml(name: string, report: string, dateRange: string) {
  const rows = report
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^#{1,3} (.*)/gm, "<h3 style='color:#0f766e;margin:16px 0 6px;font-size:15px'>$1</h3>")
    .replace(/^[•\-] (.*)/gm, "<li style='margin:4px 0'>$1</li>")
    .replace(/^✅ (.*)/gm, "<li style='margin:4px 0;color:#15803d'>✅ $1</li>")
    .replace(/^⚠️ (.*)/gm, "<li style='margin:4px 0;color:#b45309'>⚠️ $1</li>")
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, "<ul style='padding-left:20px;margin:8px 0'>$&</ul>");

  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:24px 0;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">
<tr><td style="background:#0f766e;padding:24px 28px;">
  <p style="margin:0 0 2px;font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.1em">St. Mary's AI Workforce</p>
  <p style="margin:0;font-size:20px;font-weight:bold;color:#fff">📊 Your Weekly Report</p>
  <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.75)">${dateRange}</p>
</td></tr>
<tr><td style="padding:28px 28px 8px">
  <p style="margin:0 0 16px;font-size:14px;color:#475569">Hi ${name},</p>
  <div style="font-size:14px;line-height:1.8;color:#1e293b">${rows}</div>
</td></tr>
<tr><td style="padding:16px 28px 28px">
  <a href="${process.env.APP_URL || "http://localhost:3000"}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">Open AI Workforce →</a>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e5e5e5;padding:14px 28px;text-align:center">
  <p style="margin:0;font-size:11px;color:#94a3b8">St. Mary's Home for Disabled Children · Norfolk, VA · AI Workforce System</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendReport(to: string, name: string, report: string, dateRange: string) {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smhdc-org.mail.protection.outlook.com",
    port: parseInt(process.env.SMTP_PORT || "25"),
    secure: false,
    tls: { rejectUnauthorized: false },
  });
  await transport.sendMail({
    from: `"St. Mary's AI Workforce" <${process.env.FROM_EMAIL || "noreply@smhdc.org"}>`,
    to,
    subject: "📊 Your Weekly Report — " + dateRange,
    text: report,
    html: buildEmailHtml(name, report, dateRange),
  });
}

// ── Route handlers ─────────────────────────────────────────────────────────────

async function runBroadcast(preview?: string) {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);
  const dateRange =
    since.toLocaleDateString("en-US", { month: "long", day: "numeric" }) +
    " – " +
    now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  let token: string;
  try { token = await getGraphAccessToken(); }
  catch (e: any) { return NextResponse.json({ error: "Graph auth failed: " + e.message }, { status: 500 }); }

  // Get all active users
  const usersResult = await db.query(
    "SELECT email, display_name FROM users WHERE is_active = true AND email IS NOT NULL ORDER BY display_name"
  );
  const users = usersResult.rows;

  if (preview) {
    // Single-user preview — return report JSON without emailing
    const user = users.find((u: any) => u.email === preview) ?? { email: preview, display_name: preview.split("@")[0] };
    const report = await buildUserReport(token, { email: user.email, name: user.display_name }, since, now, dateRange);
    return NextResponse.json({ success: true, preview: true, report, dateRange });
  }

  const results: { email: string; status: "sent" | "skipped" | "error"; error?: string }[] = [];

  for (const user of users) {
    try {
      const report = await buildUserReport(token, { email: user.email, name: user.display_name }, since, now, dateRange);
      if (!report) {
        results.push({ email: user.email, status: "skipped" });
        continue;
      }
      await sendReport(user.email, user.display_name, report, dateRange);
      results.push({ email: user.email, status: "sent" });
    } catch (e: any) {
      results.push({ email: user.email, status: "error", error: e.message });
    }
  }

  const sent = results.filter(r => r.status === "sent").length;
  const skipped = results.filter(r => r.status === "skipped").length;
  const errors = results.filter(r => r.status === "error").length;

  return NextResponse.json({ success: true, sent, skipped, errors, total: users.length, results });
}

// Cron trigger (secret in query)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const preview = searchParams.get("preview");

  // Admin preview
  if (preview) {
    const session = await getSession();
    if (session?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return runBroadcast(preview === "me" ? session.email! : preview);
  }

  // Cron
  const secret = searchParams.get("secret");
  if (!secret || secret !== process.env.REPORT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runBroadcast();
}

// Admin manual trigger
export async function POST(_req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return runBroadcast();
}
