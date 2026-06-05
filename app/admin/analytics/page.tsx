"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type DashboardData = {
  stats: {
    totalQuestions: number;
    questionsToday: number;
    questionsThisWeek: number;
    activeUsers: number;
    totalUsers: number;
    activeUserAccounts: number;
    loggedInThisWeek: number;
  };
  topQuestions: { question: string; count: string }[];
  agentBreakdown: { agent: string; count: string }[];
  dailyVolume: { day: string; count: string }[];
  topUsers: { user_email: string; count: string }[];
};

const AGENT_LABELS: Record<string, string> = {
  hr_policy: "🧑‍💼 HR Policy",
  it_support: "💻 IT Support",
  payroll_benefits: "💰 Payroll & Benefits",
  compliance: "📋 Compliance",
  clinical: "🩺 Clinical",
  onboarding: "🎓 Onboarding",
  scheduling: "📅 Scheduling",
  maintenance: "🔧 Maintenance",
  training: "📚 Training",
  document_assistant: "📄 Document Assistant",
  internal_knowledge: "🔍 Knowledge",
  escalation: "🚨 Escalation",
  general: "💬 General",
  unknown: "❓ Unknown",
};

function StatCard({
  label,
  value,
  sub,
  color = "#0f766e",
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
      <p className="text-sm text-[#6b7280]">{label}</p>
      <p className="mt-1 text-3xl font-bold" style={{ color }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-1 text-xs text-[#9ca3af]">{sub}</p>}
    </div>
  );
}

function BarRow({
  label,
  count,
  max,
  color = "#0f766e",
}: {
  label: string;
  count: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 truncate text-sm text-[#374151]">{label}</span>
      <div className="flex-1 rounded-full bg-[#f3f4f6] h-2.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-10 text-right text-sm font-medium text-[#374151]">{count}</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestMsg, setDigestMsg] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMsg, setReportMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => {
        if (r.status === 403) { router.push("/"); return null; }
        return r.json();
      })
      .then((d) => {
        if (d) setData(d);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8faf9]">
        <p className="text-[#6b7280] animate-pulse">Loading dashboard…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8faf9]">
        <p className="text-red-500">{error || "Failed to load"}</p>
      </div>
    );
  }

  const maxAgent = Math.max(...data.agentBreakdown.map((a) => parseInt(a.count)));
  const maxUser = Math.max(...data.topUsers.map((u) => parseInt(u.count)));

  // Build simple bar chart for daily volume
  const maxVol = Math.max(...data.dailyVolume.map((d) => parseInt(d.count)), 1);

  return (
    <div className="min-h-screen bg-[#f8faf9] p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Analytics</h1>
          <p className="text-sm text-[#6b7280]">St. Mary&apos;s AI Workforce — usage overview</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {digestMsg && <span className="text-xs text-[#6b7280]">{digestMsg}</span>}
          <button
            onClick={async () => {
              setDigestLoading(true); setDigestMsg("");
              const r = await fetch("/api/admin/digest", { method: "POST" });
              const d = await r.json();
              setDigestMsg(d.success ? `✓ Digest sent to ${d.sent} admin(s)` : (d.message || d.error || "Error"));
              setDigestLoading(false);
            }}
            disabled={digestLoading}
            className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-sm text-[#374151] hover:bg-[#f9fafb] disabled:opacity-60"
          >
            {digestLoading ? "Sending…" : "📧 Send Digest"}
          </button>
          <button
            onClick={() => window.open("/api/admin/digest?preview=html", "_blank", "noopener,noreferrer")}
            className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-sm text-[#374151] hover:bg-[#f9fafb]"
          >
            Preview Digest
          </button>
          {reportMsg && <span className="text-xs text-[#6b7280]">{reportMsg}</span>}
          <button
            onClick={async () => {
              setReportLoading(true); setReportMsg("");
              const r = await fetch("/api/reports/weekly", { method: "POST" });
              const d = await r.json();
              setReportMsg(d.success ? `✓ Reports sent to ${d.sent} staff (${d.skipped} skipped, ${d.errors} errors)` : (d.error || "Error"));
              setReportLoading(false);
            }}
            disabled={reportLoading}
            className="rounded-lg border border-[#0f766e] bg-[#f0fdf4] px-4 py-2 text-sm font-medium text-[#0f766e] hover:bg-[#dcfce7] disabled:opacity-60"
          >
            {reportLoading ? "Sending…" : "📊 Send Weekly Reports"}
          </button>
          <button
            onClick={() => window.open("/api/reports/weekly?preview=me", "_blank", "noopener,noreferrer")}
            className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-sm text-[#374151] hover:bg-[#f9fafb]"
          >
            Preview My Report
          </button>
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-sm text-[#374151] hover:bg-[#f9fafb]"
          >
            Admin Dashboard
          </button>
          <button
            onClick={() => router.push("/")}
            className="rounded-lg bg-[#0f766e] px-4 py-2 text-sm font-medium text-white hover:bg-[#115e59]"
          >
            ← Back to Chat
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Questions" value={data.stats.totalQuestions} sub="All time" />
        <StatCard label="Questions Today" value={data.stats.questionsToday} sub="Since midnight" color="#0891b2" />
        <StatCard label="This Week" value={data.stats.questionsThisWeek} sub="Mon–today" color="#7c3aed" />
        <StatCard label="Active Users (30d)" value={data.stats.activeUsers} sub="Unique staff" color="#d97706" />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <StatCard label="Staff Accounts" value={data.stats.totalUsers} sub="Total registered" />
        <StatCard label="Active Accounts" value={data.stats.activeUserAccounts} sub="Not deactivated" color="#16a34a" />
        <StatCard label="Logged In This Week" value={data.stats.loggedInThisWeek} sub="Last 7 days" color="#0891b2" />
      </div>

      {/* Charts row */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">

        {/* Daily volume */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-[#111827]">Daily Question Volume (14 days)</h2>
          {data.dailyVolume.length === 0 ? (
            <p className="text-sm text-[#9ca3af]">No data yet.</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {data.dailyVolume.map((d) => {
                const h = Math.max(4, Math.round((parseInt(d.count) / maxVol) * 112));
                const label = new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-[#6b7280]">{parseInt(d.count)}</span>
                    <div
                      className="w-full rounded-t bg-[#0f766e] hover:bg-[#115e59] transition-colors"
                      style={{ height: `${h}px` }}
                      title={`${label}: ${d.count}`}
                    />
                    <span className="text-[9px] text-[#9ca3af] rotate-0 truncate w-full text-center">{label.split(" ")[0]}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Agent breakdown */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-[#111827]">Agent Usage (30 days)</h2>
          {data.agentBreakdown.length === 0 ? (
            <p className="text-sm text-[#9ca3af]">No data yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.agentBreakdown.slice(0, 8).map((a) => (
                <BarRow
                  key={a.agent}
                  label={AGENT_LABELS[a.agent] ?? a.agent}
                  count={parseInt(a.count)}
                  max={maxAgent}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

        {/* Top questions */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-[#111827]">Top Questions (30 days)</h2>
          {data.topQuestions.length === 0 ? (
            <p className="text-sm text-[#9ca3af]">No data yet.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {data.topQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f0fdf4] text-[11px] font-semibold text-[#0f766e]">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-[#374151] leading-snug">{q.question}</span>
                  <span className="shrink-0 text-xs text-[#9ca3af] font-medium">{q.count}×</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Top users */}
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-[#111827]">Most Active Staff (30 days)</h2>
          {data.topUsers.length === 0 ? (
            <p className="text-sm text-[#9ca3af]">No data yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.topUsers.map((u) => (
                <BarRow
                  key={u.user_email}
                  label={u.user_email}
                  count={parseInt(u.count)}
                  max={maxUser}
                  color="#7c3aed"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
