"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Gap = {
  id: string;
  question: string;
  user_email: string | null;
  agent: string | null;
  flagged_at: string;
  status: "open" | "resolved" | "ignored";
  notes: string | null;
};

type Counts = { open?: number; resolved?: number; ignored?: number };

const STATUS_STYLES: Record<string, string> = {
  open: "border-amber-200 bg-amber-50 text-amber-700",
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ignored: "border-slate-200 bg-slate-50 text-slate-500",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function KnowledgeGapsPage() {
  const router = useRouter();
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [filter, setFilter] = useState<"open" | "resolved" | "ignored" | "all">("open");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");

  useEffect(() => {
    fetch("/api/admin/knowledge-gaps?status=" + filter)
      .then((r) => {
        if (r.status === 401) { router.push("/login?callbackUrl=/admin/knowledge-gaps"); return null; }
        if (r.status === 403) { router.push("/"); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setGaps(d.gaps || []);
        setCounts(d.counts || {});
        setLoading(false);
      });
  }, [filter, router]);

  async function updateStatus(id: string, status: string, notes?: string) {
    setActionLoading(id);
    await fetch("/api/admin/knowledge-gaps", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, notes }),
    });
    setGaps((prev) =>
      status === filter || filter === "all"
        ? prev.map((g) => g.id === id ? { ...g, status: status as Gap["status"] } : g)
        : prev.filter((g) => g.id !== id)
    );
    setActionLoading(null);
  }

  async function sendAlert() {
    setAlertLoading(true);
    setAlertMsg("");
    const res = await fetch("/api/admin/knowledge-gaps", { method: "POST" });
    const d = await res.json();
    setAlertMsg(d.message || (d.success ? `Alert sent for ${d.sent} gap(s)` : d.error || "Error"));
    setAlertLoading(false);
  }

  return (
    <main className="min-h-screen bg-white text-[#171717]">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[260px_1fr]">
        <aside className="border-r border-[#e5e5e5] bg-[#f9f9f9] p-3">
          <div className="mb-4 rounded-xl bg-white p-3">
            <img
              src="https://saintmaryshome.org/wp-content/uploads/2025/05/SMH-Logo-2025_LinearStackedTagline-Color.svg"
              alt="St. Mary's Home"
              className="h-14 w-auto"
            />
          </div>

          <nav className="mb-5 space-y-1 text-sm">
            <a href="/" className="block rounded-lg px-3 py-2 text-[#444] hover:bg-[#ececec]">← AI Chat</a>
            <a href="/knowledge" className="block rounded-lg px-3 py-2 text-[#444] hover:bg-[#ececec]">Knowledge Library</a>
            <a href="/admin/knowledge-gaps" className="block rounded-lg bg-[#ececec] px-3 py-2 font-medium">Knowledge Gaps</a>
            <a href="/admin/dashboard" className="block rounded-lg px-3 py-2 text-[#444] hover:bg-[#ececec]">Admin Dashboard</a>
          </nav>

          <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Gap Review</p>
            <p className="mt-2 text-xs leading-5 text-[#64748b]">
              Use this page to find questions that need better source documents or reindexing.
            </p>
          </div>
        </aside>

        <section className="flex min-h-screen flex-col">
          <header className="border-b border-[#eeeeee] px-6 py-5">
            <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#0f766e]">St. Mary&apos;s Home</p>
                <h1 className="mt-1 text-2xl font-semibold">Knowledge Gaps</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#666]">
                  Questions the AI could not answer from approved internal documents. Add, sync, or reindex content to close these gaps.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {alertMsg && <span className="text-xs text-[#64748b]">{alertMsg}</span>}
                <button
                  onClick={sendAlert}
                  disabled={alertLoading}
                  className="rounded-lg border border-[#d9e2df] bg-white px-3 py-2 text-sm font-medium text-[#0f766e] shadow-sm hover:border-[#0f766e] hover:bg-[#f0fdfa] disabled:opacity-60"
                >
                  {alertLoading ? "Sending..." : "Email IT Support"}
                </button>
                <a href="/knowledge" className="rounded-lg bg-[#0f766e] px-3 py-2 text-sm font-medium text-white hover:bg-[#0d6460]">
                  ← Back to Knowledge Library
                </a>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mx-auto max-w-5xl space-y-4">

              <div className="flex flex-wrap gap-2">
                {[
                  { key: "open", label: "Open", color: "border-amber-200 bg-amber-50 text-amber-700" },
                  { key: "resolved", label: "Resolved", color: "border-emerald-200 bg-emerald-50 text-emerald-700" },
                  { key: "ignored", label: "Ignored", color: "border-slate-200 bg-slate-50 text-slate-500" },
                  { key: "all", label: "All", color: "border-[#d9e2df] bg-[#f8fafc] text-[#475569]" },
                ].map(({ key, label, color }) => (
                  <button
                    key={key}
                    onClick={() => { setLoading(true); setFilter(key as typeof filter); }}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      filter === key ? color : "border-[#e5e7eb] bg-white text-[#64748b] hover:bg-[#f8fafc]"
                    }`}
                  >
                    {label}
                    {key !== "all" && counts[key as keyof Counts] != null && (
                      <span className="ml-1.5 text-xs opacity-70">({counts[key as keyof Counts]})</span>
                    )}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-center text-sm text-[#666]">
                  Loading gaps…
                </div>
              ) : gaps.length === 0 ? (
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] py-16 text-center">
                  <p className="text-2xl mb-2">✅</p>
                  <p className="text-sm text-[#666]">No {filter === "all" ? "" : filter} knowledge gaps found.</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e5e7eb] bg-[#f8fafc] text-xs uppercase tracking-wide text-[#64748b]">
                        <th className="px-4 py-3 text-left font-medium">Question</th>
                        <th className="px-4 py-3 text-left font-medium">Staff</th>
                        <th className="px-4 py-3 text-left font-medium">Agent</th>
                        <th className="px-4 py-3 text-left font-medium">Date</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gaps.map((gap) => (
                        <tr key={gap.id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
                          <td className="px-4 py-3 max-w-xs">
                            <p className="line-clamp-2 text-[#111827]">{gap.question}</p>
                            {gap.notes && <p className="mt-0.5 text-xs italic text-[#94a3b8]">{gap.notes}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#64748b] whitespace-nowrap">
                            {gap.user_email?.replace("@smhdc.org", "") || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#64748b] whitespace-nowrap">
                            {gap.agent?.replace(/_/g, " ") || "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#94a3b8] whitespace-nowrap">
                            {formatDate(gap.flagged_at)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[gap.status]}`}>
                              {gap.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5 justify-end">
                              {gap.status !== "resolved" && (
                                <button
                                  onClick={() => updateStatus(gap.id, "resolved")}
                                  disabled={actionLoading === gap.id}
                                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                  ✓ Resolve
                                </button>
                              )}
                              {gap.status !== "ignored" && (
                                <button
                                  onClick={() => updateStatus(gap.id, "ignored")}
                                  disabled={actionLoading === gap.id}
                                  className="rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1 text-xs font-medium text-[#64748b] hover:bg-[#f8fafc] disabled:opacity-50"
                                >
                                  Ignore
                                </button>
                              )}
                              {gap.status !== "open" && (
                                <button
                                  onClick={() => updateStatus(gap.id, "open")}
                                  disabled={actionLoading === gap.id}
                                  className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                                >
                                  Reopen
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
