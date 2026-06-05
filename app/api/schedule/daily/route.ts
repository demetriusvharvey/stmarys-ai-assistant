import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGraphAccessToken } from "@/lib/microsoftGraph";
import { openai } from "@/lib/openai";
import { deIdentifyText } from "@/lib/phi/deidentify";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── Helpers ──────────────────────────────────────────────────────────────────

function scrub(text: string | null | undefined): string {
  if (!text) return "";
  return deIdentifyText(text).cleanText;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/New_York",
  });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/New_York",
  });
}

async function graphGet(token: string, url: string) {
  const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error?.message || res.status.toString()));
  }
  return res.json();
}

// ── Graph fetchers ────────────────────────────────────────────────────────────

async function getCalendarEvents(token: string, email: string, startDate: Date, endDate: Date) {
  const url =
    "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) +
    "/calendarView?startDateTime=" + startDate.toISOString() +
    "&endDateTime=" + endDate.toISOString() +
    "&$select=subject,start,end,location,body,importance,isAllDay,organizer,attendees,isRecurring" +
    "&$orderby=start/dateTime&$top=50";
  const data = await graphGet(token, url);
  return data.value ?? [];
}

async function getEmails(token: string, email: string) {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Fetch unread + high importance + flagged in parallel
  const [unread, important, flagged] = await Promise.all([
    graphGet(token,
      "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) +
      "/messages?$filter=isRead eq false and receivedDateTime ge " + since +
      "&$select=subject,from,receivedDateTime,importance,body,isRead,flag" +
      "&$orderby=receivedDateTime desc&$top=15"
    ).catch(() => ({ value: [] })),

    graphGet(token,
      "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) +
      "/messages?$filter=importance eq 'high' and receivedDateTime ge " + since +
      "&$select=subject,from,receivedDateTime,importance,body,isRead,flag" +
      "&$orderby=receivedDateTime desc&$top=10"
    ).catch(() => ({ value: [] })),

    graphGet(token,
      "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) +
      "/messages?$filter=flag/flagStatus eq 'flagged'" +
      "&$select=subject,from,receivedDateTime,importance,body,isRead,flag" +
      "&$orderby=receivedDateTime desc&$top=10"
    ).catch(() => ({ value: [] })),
  ]);

  // Deduplicate by id
  const seen = new Set<string>();
  const all: any[] = [];
  for (const e of [...(unread.value ?? []), ...(important.value ?? []), ...(flagged.value ?? [])]) {
    if (!seen.has(e.id)) { seen.add(e.id); all.push(e); }
  }
  return all;
}

async function getTodoTasks(token: string, email: string) {
  try {
    const lists = await graphGet(token,
      "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) + "/todo/lists"
    );
    const tasks: any[] = [];
    for (const list of (lists.value ?? []).slice(0, 5)) {
      const t = await graphGet(token,
        "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) +
        "/todo/lists/" + list.id +
        "/tasks?$filter=status ne 'completed'&$select=title,importance,dueDateTime,status,body&$top=20"
      ).catch(() => ({ value: [] }));
      for (const task of (t.value ?? [])) {
        tasks.push({ ...task, listName: list.displayName });
      }
    }
    return tasks;
  } catch { return []; }
}

async function getPlannerTasks(token: string, email: string) {
  try {
    const user = await graphGet(token,
      "https://graph.microsoft.com/v1.0/users/" + encodeURIComponent(email) + "?$select=id"
    );
    const tasks = await graphGet(token,
      "https://graph.microsoft.com/v1.0/users/" + user.id +
      "/planner/tasks?$select=title,dueDateTime,percentComplete,priority,planId"
    );
    return (tasks.value ?? []).filter((t: any) => t.percentComplete < 100);
  } catch { return []; }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = (searchParams.get("mode") ?? "daily") as "daily" | "weekly";
  const workStart = parseInt(searchParams.get("workStart") ?? "8");
  const workEnd = parseInt(searchParams.get("workEnd") ?? "17");
  const userEmail = session.email;

  if (!userEmail) return NextResponse.json({ error: "No email in session" }, { status: 400 });

  let token: string;
  try {
    token = await getGraphAccessToken();
  } catch (e: any) {
    return NextResponse.json({ error: "Graph auth failed: " + e.message }, { status: 500 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today); dayAfter.setDate(dayAfter.getDate() + 2);
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + (mode === "weekly" ? 7 : 1));

  let todayEvents: any[] = [], tomorrowEvents: any[] = [],
      emails: any[] = [], todoTasks: any[] = [], plannerTasks: any[] = [];
  let graphError: string | null = null;

  try {
    [todayEvents, tomorrowEvents, emails, todoTasks, plannerTasks] = await Promise.all([
      getCalendarEvents(token, userEmail, today, weekEnd),
      mode === "daily" ? getCalendarEvents(token, userEmail, tomorrow, dayAfter) : Promise.resolve([]),
      getEmails(token, userEmail),
      getTodoTasks(token, userEmail),
      getPlannerTasks(token, userEmail),
    ]);
  } catch (e: any) {
    graphError = e.message;
  }

  const dateStr = fmtDate(today);
  const tomorrowStr = fmtDate(tomorrow);

  // ── Format calendar events ──────────────────────────────────────────────────
  function formatEvent(e: any) {
    const time = e.isAllDay ? "All day" : fmtTime(e.start.dateTime) + " – " + fmtTime(e.end.dateTime);
    const body = e.body?.content ? scrub(stripHtml(e.body.content).slice(0, 200)) : "";
    const loc = e.location?.displayName ? " @ " + scrub(e.location.displayName) : "";
    const attendeeList = (e.attendees ?? [])
      .filter((a: any) => a.type !== "resource")
      .slice(0, 5)
      .map((a: any) => scrub(a.emailAddress?.name ?? a.emailAddress?.address ?? ""))
      .filter(Boolean)
      .join(", ");
    const recurring = e.isRecurring ? " [recurring]" : "";
    const importance = e.importance === "high" ? " ⚡" : "";
    return (
      "• " + time + importance + recurring + ": " + scrub(e.subject) + loc +
      (attendeeList ? "\n  Attendees: " + attendeeList : "") +
      (body ? "\n  Details: " + body : "")
    );
  }

  const eventText = todayEvents.length === 0
    ? "No calendar events."
    : todayEvents.map(formatEvent).join("\n\n");

  const tomorrowEventText = tomorrowEvents.length === 0
    ? "No events tomorrow."
    : tomorrowEvents.map(formatEvent).join("\n\n");

  // ── Format emails ───────────────────────────────────────────────────────────
  const emailText = emails.length === 0
    ? "No priority emails."
    : emails.slice(0, 12).map((e: any) => {
        const from = scrub(e.from?.emailAddress?.name ?? e.from?.emailAddress?.address ?? "Unknown");
        const subject = scrub(e.subject ?? "(no subject)");
        const body = e.body?.content ? scrub(stripHtml(e.body.content).slice(0, 300)) : "";
        const flags: string[] = [];
        if (!e.isRead) flags.push("UNREAD");
        if (e.importance === "high") flags.push("⚡ HIGH PRIORITY");
        if (e.flag?.flagStatus === "flagged") flags.push("🚩 FLAGGED");
        return "• From " + from + ': "' + subject + '" [' + (flags.join(", ") || "read") + "]" +
          (body ? "\n  " + body : "");
      }).join("\n\n");

  // ── Format tasks ────────────────────────────────────────────────────────────
  const todoText = todoTasks.length === 0 ? "No open tasks." :
    todoTasks.slice(0, 15).map((t: any) => {
      const due = t.dueDateTime ? " (due " + new Date(t.dueDateTime.dateTime).toLocaleDateString() + ")" : "";
      const imp = t.importance === "high" ? " ⚡" : "";
      return "• " + scrub(t.title) + imp + due + " [" + (t.listName ?? "Tasks") + "]";
    }).join("\n");

  const plannerText = plannerTasks.length === 0 ? "No Planner tasks." :
    plannerTasks.slice(0, 10).map((t: any) => {
      const due = t.dueDateTime ? " (due " + new Date(t.dueDateTime).toLocaleDateString() + ")" : "";
      const pct = t.percentComplete > 0 ? " [" + t.percentComplete + "% done]" : "";
      return "• " + scrub(t.title) + due + pct;
    }).join("\n");

  // ── Prompt ──────────────────────────────────────────────────────────────────
  const isWeekly = mode === "weekly";
  const prompt = [
    "You are a smart executive assistant for " + (session.name ?? userEmail) +
    " at St. Mary's Home for Disabled Children in Norfolk, VA — an ICF/IID healthcare facility.",
    "",
    "Today is " + dateStr + ". Work hours: " + workStart + ":00 – " + workEnd + ":00 ET.",
    "Build a clear, prioritized " + (isWeekly ? "WEEKLY" : "DAILY") + " schedule.",
    "",
    "=== CALENDAR EVENTS " + (isWeekly ? "(THIS WEEK)" : "(TODAY)") + " ===",
    eventText,
    "",
    ...(mode === "daily" ? [
      "=== TOMORROW PREVIEW ===",
      tomorrowEventText,
      "",
    ] : []),
    "=== PRIORITY EMAILS (unread / high-importance / flagged) ===",
    emailText,
    "",
    "=== MICROSOFT TO-DO TASKS ===",
    todoText,
    "",
    "=== PLANNER TASKS ===",
    plannerText,
    "",
    "INSTRUCTIONS:",
    "- Start with a **Priority Actions** section (max 5 bullets — the most critical things today)",
    "- Then build time blocks within work hours (" + workStart + ":00–" + workEnd + ":00)",
    isWeekly
      ? "- Organize by day (Monday through Friday)"
      : "- Sections: Morning | Afternoon | End of Day",
    "- Mark ⚡ urgent, 📧 needs email reply, ✅ task to complete, 📅 meeting",
    "- Flag any emails where a response is overdue",
    "- If a To-Do/Planner task has a due date today, make it visible",
    mode === "daily"
      ? "- End with a 'Tomorrow' section (1–3 bullets) based on the tomorrow preview"
      : "",
    !isWeekly ? "- Last line: '💬 Want me to build your **weekly schedule** too?'" : "",
    "- Use markdown with bold headers and bullets. Keep it concise and actionable.",
  ].filter(s => s !== undefined).join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 2000,
    });

    const schedule = completion.choices[0]?.message?.content ?? "Unable to generate schedule.";

    return NextResponse.json({
      success: true,
      schedule,
      mode,
      date: dateStr,
      eventCount: todayEvents.length,
      emailCount: emails.length,
      todoCount: todoTasks.length,
      plannerCount: plannerTasks.length,
      graphError,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
