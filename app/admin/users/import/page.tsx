"use client";

import { useState, useRef } from "react";

type ImportResult = {
  email: string;
  status: "created" | "skipped" | "error";
  error?: string;
  emailSent?: boolean;
};

type Summary = { total: number; created: number; skipped: number; errors: number };

export default function BulkImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] || null);
    setResults(null);
    setSummary(null);
    setError("");
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError("");
    setResults(null);
    setSummary(null);

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/api/admin/users/import", { method: "POST", body: fd });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Import failed");
      return;
    }

    setResults(data.results);
    setSummary(data.summary);
  }

  const STATUS_STYLES = {
    created: "text-emerald-700",
    skipped: "text-amber-700",
    error: "text-red-700",
  };
  const STATUS_ICONS = { created: "✓", skipped: "~", error: "✕" };

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
            <a href="/admin/users" className="block rounded-lg px-3 py-2 text-[#444] hover:bg-[#ececec]">Manage Accounts</a>
            <a href="/admin/users/import" className="block rounded-lg bg-[#ececec] px-3 py-2 font-medium">Bulk Import</a>
            <a href="/admin/dashboard" className="block rounded-lg px-3 py-2 text-[#444] hover:bg-[#ececec]">Admin Dashboard</a>
          </nav>

          <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Account Import</p>
            <p className="mt-2 text-xs leading-5 text-[#64748b]">
              Upload a CSV to create staff accounts in bulk. Staff receive temporary passwords and must change them on first login.
            </p>
          </div>
        </aside>

        <section className="flex min-h-screen flex-col">
          <header className="border-b border-[#eeeeee] px-6 py-5">
            <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#0f766e]">St. Mary&apos;s Home</p>
                <h1 className="mt-1 text-2xl font-semibold">Bulk User Import</h1>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#666]">
                  Upload a CSV to create multiple staff accounts at once.
                </p>
              </div>
              <a href="/admin/users" className="rounded-lg bg-[#0f766e] px-3 py-2 text-sm font-medium text-white hover:bg-[#0d6460]">
                ← Back to Manage Accounts
              </a>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mx-auto max-w-5xl space-y-4">

              <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-5">
                <p className="mb-3 text-sm font-semibold text-[#111827]">CSV Format</p>
                <p className="mb-3 text-xs leading-5 text-[#64748b]">
                  Required column: <code className="rounded bg-white px-1.5 py-0.5 text-[#0f766e] ring-1 ring-[#d9e2df]">email</code>.
                  Optional: <code className="rounded bg-white px-1.5 py-0.5 text-[#0f766e] ring-1 ring-[#d9e2df]">name</code>,{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 text-[#0f766e] ring-1 ring-[#d9e2df]">role</code> (staff / it_staff / admin, default: staff).
                </p>
                <div className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-3 font-mono text-xs leading-6 text-[#334155]">
                  <div>name,email,role</div>
                  <div>Jane Smith,jsmith@smhdc.org,staff</div>
                  <div>Tom Rivera,trivera@smhdc.org,it_staff</div>
                  <div>Lisa Nguyen,lnguyen@smhdc.org,staff</div>
                </div>
                <p className="mt-3 text-xs leading-5 text-[#64748b]">
                  A secure temporary password is auto-generated for each account. Welcome emails are sent automatically. Staff must change their password on first login.
                </p>
              </div>

              <div
                className="cursor-pointer rounded-xl border-2 border-dashed border-[#cbd5e1] bg-white p-8 text-center shadow-sm transition hover:border-[#0f766e] hover:bg-[#f0fdfa]"
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <div>
                    <p className="font-medium text-[#111827]">{file.name}</p>
                    <p className="mt-1 text-xs text-[#64748b]">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-3xl mb-2">📄</p>
                    <p className="text-sm text-[#64748b]">Click to select CSV file</p>
                  </div>
                )}
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <button
                onClick={handleUpload}
                disabled={!file || loading}
                className="w-full rounded-xl bg-[#0f766e] py-3 text-sm font-semibold text-white transition hover:bg-[#0d6460] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Importing..." : "Import Users"}
              </button>

              {summary && (
                <div className="rounded-xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
                  <p className="mb-3 text-sm font-semibold text-[#111827]">Import Summary</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="font-medium text-emerald-700">✓ {summary.created} created</span>
                    <span className="font-medium text-amber-700">~ {summary.skipped} skipped</span>
                    {summary.errors > 0 && <span className="font-medium text-red-700">✕ {summary.errors} errors</span>}
                    <span className="ml-auto text-[#64748b]">{summary.total} total rows</span>
                  </div>
                </div>
              )}

              {results && results.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e5e7eb] bg-[#f8fafc] text-xs uppercase tracking-wide text-[#64748b]">
                        <th className="px-4 py-3 text-left font-medium">Email</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                        <th className="px-4 py-3 text-left font-medium">Email Sent</th>
                        <th className="px-4 py-3 text-left font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
                          <td className="px-4 py-2.5 text-[#111827]">{r.email}</td>
                          <td className={`px-4 py-2.5 font-medium ${STATUS_STYLES[r.status]}`}>
                            {STATUS_ICONS[r.status]} {r.status}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-[#64748b]">
                            {r.status === "created" ? (r.emailSent ? "✓ Sent" : "⚠ Failed") : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-[#94a3b8]">{r.error || ""}</td>
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
