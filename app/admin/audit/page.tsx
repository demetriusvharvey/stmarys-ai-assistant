"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type AuditLog = {
  id: string;
  user_email: string | null;
  action: string;
  route: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const ACTION_COLORS: Record<string, string> = {
  chat_stream:       "bg-blue-50 text-blue-700",
  answer_question:   "bg-purple-50 text-purple-700",
  tool_call:         "bg-amber-50 text-amber-700",
  login:             "bg-green-50 text-green-700",
  logout:            "bg-slate-50 text-slate-600",
};

function actionColor(action: string) {
  for (const [key, cls] of Object.entries(ACTION_COLORS)) {
    if (action.includes(key)) return cls;
  }
  return "bg-slate-50 text-slate-600";
}

export default function AuditLogPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterEmail, setFilterEmail] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const LIMIT = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterEmail) params.set("userEmail", filterEmail);
    if (filterAction) params.set("action", filterAction);
    params.set("limit", String(LIMIT));
    params.set("offset", String(offset));

    const res = await fetch(`/api/admin/audit-logs?${params}`);
    if (res.status === 403) { router.push("/"); return; }
    const data = await res.json();
    setLogs(data.logs || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [filterEmail, filterAction, offset, router]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    fetchLogs();
  }

  return (
    <main className="min-h-screen bg-[#f8faf9] px-4 py-10">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#111827]">Audit Log</h1>
            <p className="mt-0.5 text-sm text-[#6b7280]">
              All staff activity — {total.toLocaleString()} records total
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb]"
          >
            ← Back to Chat
          </button>
        </div>

        {/* Filters */}
        <form onSubmit={handleSearch} className="mb-4 flex gap-3">
          <input
            value={filterEmail}
            onChange={e => setFilterEmail(e.target.value)}
            placeholder="Filter by email..."
            className="w-56 rounded-lg border border-[#d1d5db] px-3 py-2 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
          />
          <input
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            placeholder="Filter by action..."
            className="w-56 rounded-lg border border-[#d1d5db] px-3 py-2 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
          />
          <button
            type="submit"
            className="rounded-lg bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#115e59]"
          >
            Search
          </button>
          {(filterEmail || filterAction) && (
            <button
              type="button"
              onClick={() => { setFilterEmail(""); setFilterAction(""); setOffset(0); }}
              className="rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb]"
            >
              Clear
            </button>
          )}
        </form>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-[#9ca3af]">Loading logs…</div>
          ) : logs.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[#9ca3af]">No logs found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f1f5f9] bg-[#f8faf9]">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Time</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">User</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Action</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Route</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {logs.map((log) => (
                  <>
                    <tr key={log.id} className="hover:bg-[#f8faf9]">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-[#6b7280]">{formatDate(log.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-[#374151]">{log.user_email ?? <span className="text-[#9ca3af]">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${actionColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#6b7280]">{log.route ?? "—"}</td>
                      <td className="px-4 py-3">
                        {log.metadata && (
                          <button
                            onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                            className="text-xs text-[#0f766e] hover:underline"
                          >
                            {expanded === log.id ? "hide" : "view"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded === log.id && log.metadata && (
                      <tr key={`${log.id}-meta`} className="bg-[#f8faf9]">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="overflow-x-auto rounded-lg bg-[#1e293b] p-3 text-[11px] text-[#94a3b8]">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {total > LIMIT && (
          <div className="mt-4 flex items-center justify-between text-sm text-[#6b7280]">
            <span>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total.toLocaleString()}</span>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                className="rounded-lg border border-[#d1d5db] bg-white px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-[#f9fafb]"
              >
                ← Previous
              </button>
              <button
                disabled={offset + LIMIT >= total}
                onClick={() => setOffset(offset + LIMIT)}
                className="rounded-lg border border-[#d1d5db] bg-white px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-[#f9fafb]"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-[#c4c9d4]">
          Admin panel — St. Mary&apos;s AI Workforce. Audit logs are retained indefinitely.
        </p>
      </div>
    </main>
  );
}
