"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type QueueRow = {
  status: string;
  count: number;
};

type Failure = {
  item_name: string;
  site_name: string;
  error: string;
  processed_at: string | null;
};

type Job = {
  id: string;
  status: string;
  total_sites: number;
  total_items: number;
  supported_files: number;
  synced_files: number;
  failed_files: number;
  current_site: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type DashboardData = {
  success: boolean;
  queue: QueueRow[];
  documents: {
    total_documents: number;
  };
  chunks: {
    total_chunks: number;
  };
  recentFailures: Failure[];
  recentJobs: Job[];
};

type ProcessResult = {
  success: boolean;
  processed: number;
  failed: number;
  durationMs?: number;
  message?: string;
  results?: {
    file: string;
    status: string;
    chunks?: number;
    error?: string;
  }[];
};

export default function SyncAdminPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [lastResult, setLastResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopAutoRef = useRef(false);

  async function loadDashboard() {
    try {
      const res = await fetch("/api/sharepoint/sync/dashboard", {
        cache: "no-store",
      });

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Failed to load dashboard");
      }

      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function processBatch(size = batchSize) {
    setProcessing(true);
    setError(null);

    try {
      const res = await fetch("/api/sharepoint/sync/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchSize: size,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Batch process failed");
      }

      setLastResult(json);
      await loadDashboard();

      return json as ProcessResult;
    } catch (err: any) {
      setError(err.message || "Batch process failed");
      return null;
    } finally {
      setProcessing(false);
    }
  }

  async function startAutoProcess() {
    stopAutoRef.current = false;
    setAutoProcessing(true);
    setError(null);

    try {
      while (!stopAutoRef.current) {
        const result = await processBatch(batchSize);

        if (!result) break;

        if (result.processed === 0 && result.failed === 0) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } finally {
      setAutoProcessing(false);
      await loadDashboard();
    }
  }

  function stopAutoProcess() {
    stopAutoRef.current = true;
    setAutoProcessing(false);
  }

  useEffect(() => {
    loadDashboard();

    const interval = setInterval(() => {
      loadDashboard();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const queueMap = useMemo(() => {
    const map: Record<string, number> = {};

    for (const row of data?.queue || []) {
      map[row.status] = Number(row.count || 0);
    }

    return map;
  }, [data]);

  const pending = queueMap.pending || 0;
  const synced = queueMap.synced || 0;
  const failed = queueMap.failed || 0;
  const processingCount = queueMap.processing || 0;
  const totalQueued = pending + synced + failed + processingCount;

  const progress =
    totalQueued > 0 ? Math.round((synced / totalQueued) * 100) : 0;

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">
              St. Mary&apos;s Home AI Assistant
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              SharePoint Sync Admin
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Queue, process, monitor, and safely ingest every supported
              SharePoint document into the internal knowledge base.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadDashboard}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
            >
              Refresh
            </button>

            <a
              href="/knowledge"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
            >
              Knowledge Library
            </a>

            <a
              href="/"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
            >
              Back to Chat
            </a>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mb-6 grid gap-4 md:grid-cols-5">
          <StatCard label="Documents" value={data?.documents?.total_documents || 0} />
          <StatCard label="Vector Chunks" value={data?.chunks?.total_chunks || 0} />
          <StatCard label="Pending" value={pending} />
          <StatCard label="Synced" value={synced} />
          <StatCard label="Failed" value={failed} />
        </section>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Ingestion Progress</h2>
              <p className="text-sm text-slate-500">
                {synced.toLocaleString()} of {totalQueued.toLocaleString()} queued
                files synced. {pending.toLocaleString()} remaining.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={processing || autoProcessing}
              >
                <option value={5}>Batch 5</option>
                <option value={10}>Batch 10</option>
                <option value={20}>Batch 20</option>
                <option value={25}>Batch 25</option>
              </select>

              <button
                onClick={() => processBatch(batchSize)}
                disabled={processing || autoProcessing}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing ? "Processing..." : "Process Batch"}
              </button>

              {!autoProcessing ? (
                <button
                  onClick={startAutoProcess}
                  disabled={processing || pending === 0}
                  className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Auto Process All
                </button>
              ) : (
                <button
                  onClick={stopAutoProcess}
                  className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-800"
                >
                  Stop Auto Sync
                </button>
              )}
            </div>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
            <span>Progress: {progress}%</span>
            <span>Processing: {processingCount}</span>
            <span>Total queued: {totalQueued.toLocaleString()}</span>
          </div>
        </section>

        {lastResult && (
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Last Batch Result</h2>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <MiniStat label="Processed" value={lastResult.processed} />
              <MiniStat label="Failed" value={lastResult.failed} />
              <MiniStat
                label="Duration"
                value={`${Math.round((lastResult.durationMs || 0) / 1000)}s`}
              />
            </div>

            <div className="max-h-72 overflow-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">File</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Chunks</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {(lastResult.results || []).map((item, index) => (
                    <tr key={`${item.file}-${index}`} className="border-t border-slate-100">
                      <td className="px-4 py-3">{item.file}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3">{item.chunks ?? "-"}</td>
                      <td className="px-4 py-3 text-red-600">{item.error || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Recent Jobs</h2>

            <div className="overflow-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Supported</th>
                    <th className="px-4 py-3">Synced</th>
                    <th className="px-4 py-3">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentJobs || []).map((job) => (
                    <tr key={job.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3">{job.supported_files}</td>
                      <td className="px-4 py-3">{job.synced_files}</td>
                      <td className="px-4 py-3">{job.failed_files}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Recent Failures</h2>

            <div className="max-h-96 overflow-auto rounded-xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">File</th>
                    <th className="px-4 py-3">Site</th>
                    <th className="px-4 py-3">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentFailures || []).map((failure, index) => (
                    <tr key={`${failure.item_name}-${index}`} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium">{failure.item_name}</td>
                      <td className="px-4 py-3 text-slate-600">{failure.site_name}</td>
                      <td className="px-4 py-3 text-red-600">{failure.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {loading && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            Loading sync dashboard...
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">
        {Number(value || 0).toLocaleString()}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  const classes =
    normalized === "synced" || normalized === "pending"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : normalized === "failed"
      ? "bg-red-50 text-red-700 border-red-200"
      : normalized === "processing" || normalized === "discovering"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}>
      {status}
    </span>
  );
}