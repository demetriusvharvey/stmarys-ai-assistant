"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DocumentItem = {
  id: string;
  title: string;
  category: string;
  source: string;
  source_url?: string;
  is_active: boolean;
  created_at: string;
  chunks: number;
};

type CurrentUser = {
  name: string;
  email: string;
  role: string;
};

const LOGO_URL =
  "https://saintmaryshome.org/wp-content/uploads/2025/05/SMH-Logo-2025_LinearStackedTagline-Color.svg";

const CATEGORY_MAP: [string[], string][] = [
  [["caretracker"], "CareTracker"],
  [["sigmacare"], "SigmaCare"],
  [["onboarding"], "Onboarding"],
  [["policy", "policies"], "Policies"],
  [["baa", "soc", "iso", "compliance"], "Compliance / BAA / SOC"],
  [["ascom", "myco", "phone", "nurse call"], "Phone / Nurse Call"],
  [["vendor", "contract"], "Vendors / Contracts"],
  [["training"], "Training"],
  [["human resources", "hr policy", "hr "], "Human Resources"],
  [["nursing", "nurse"], "Nursing"],
  [["sharepoint"], "SharePoint"],
  [["medical", "clinical", "cms", "osha", "cdc", "health"], "Medical / Public"],
  [["it support", "it "], "IT"],
];

function normalizeCategory(doc: DocumentItem) {
  const value = `${doc.category || ""} ${doc.source || ""} ${doc.title || ""}`.toLowerCase();
  for (const [keywords, label] of CATEGORY_MAP) {
    if (keywords.some((k) => value.includes(k))) return label;
  }
  return doc.category || "Other";
}

function getSourceType(doc: DocumentItem): "internal" | "sharepoint" | "public" {
  const val = `${doc.source || ""} ${doc.source_url || ""}`.toLowerCase();
  if (val.includes("sharepoint") || val.includes("microsoft")) return "sharepoint";
  if (
    val.includes("cms.gov") || val.includes("osha.gov") || val.includes("cdc.gov") ||
    val.includes("nih.gov") || val.includes("who.int") || val.includes("public") ||
    val.includes("federal") || val.includes("state")
  ) return "public";
  return "internal";
}

const SOURCE_TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  internal: { label: "Internal", color: "#0f766e", bg: "#f0fdf4" },
  sharepoint: { label: "SharePoint", color: "#2563eb", bg: "#eff6ff" },
  public: { label: "Public / Medical", color: "#7c3aed", bg: "#f5f3ff" },
};

type SortKey = "date_desc" | "date_asc" | "title_asc" | "chunks_desc";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "title_asc", label: "Title A–Z" },
  { value: "chunks_desc", label: "Most chunks" },
];

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeSourceType, setActiveSourceType] = useState("All");
  const [showInactive, setShowInactive] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function loadDocuments() {
    try {
      setLoading(true);
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (data.success) {
        setDocuments(data.documents || []);
        setLoadError(null);
      } else {
        setLoadError(data.error || "Unable to load the Knowledge Library.");
      }
    } catch {
      setLoadError("Unable to load the Knowledge Library.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => setCurrentUser(data.user || null))
      .catch(() => setCurrentUser(null));
  }, []);

  const isAdmin = currentUser?.role === "admin";

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    if (!uploadFile) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      if (uploadTitle.trim()) form.append("title", uploadTitle.trim());
      if (uploadCategory.trim()) form.append("category", uploadCategory.trim());
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const data = await res.json();
      if (data.success) {
        setUploadResult({ success: true, message: `✅ "${data.title}" uploaded — ${data.chunks} chunks embedded.` });
        setUploadFile(null);
        setUploadTitle("");
        setUploadCategory("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        await loadDocuments();
      } else {
        setUploadResult({ success: false, message: data.error || "Upload failed." });
      }
    } catch (err: any) {
      setUploadResult({ success: false, message: err.message || "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function toggleActive(doc: DocumentItem) {
    if (!isAdmin) return;
    setTogglingId(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !doc.is_active }),
      });
      const data = await res.json();
      if (data.success) {
        setDocuments((prev) => prev.map((d) => d.id === doc.id ? { ...d, is_active: !doc.is_active } : d));
      }
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteDoc(doc: DocumentItem) {
    if (!isAdmin) return;
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  const enriched = useMemo(() =>
    documents.map((doc) => ({
      ...doc,
      normalizedCategory: normalizeCategory(doc),
      sourceType: getSourceType(doc),
    })),
    [documents]
  );

  const visible = useMemo(() =>
    showInactive ? enriched : enriched.filter((d) => d.is_active !== false),
    [enriched, showInactive]
  );

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of visible) counts.set(doc.normalizedCategory, (counts.get(doc.normalizedCategory) || 0) + 1);
    return [
      { name: "All", count: visible.length },
      ...Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
    ];
  }, [visible]);

  const sourceTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { All: visible.length, internal: 0, sharepoint: 0, public: 0 };
    for (const doc of visible) counts[doc.sourceType] = (counts[doc.sourceType] || 0) + 1;
    return counts;
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    let docs = visible.filter((doc) => {
      const matchCat = activeCategory === "All" || doc.normalizedCategory === activeCategory;
      const matchSource = activeSourceType === "All" || doc.sourceType === activeSourceType;
      const matchQuery = !q || doc.title?.toLowerCase().includes(q) || doc.source?.toLowerCase().includes(q) || doc.category?.toLowerCase().includes(q);
      return matchCat && matchSource && matchQuery;
    });

    switch (sortKey) {
      case "date_asc": docs = [...docs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
      case "date_desc": docs = [...docs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case "title_asc": docs = [...docs].sort((a, b) => (a.title || "").localeCompare(b.title || "")); break;
      case "chunks_desc": docs = [...docs].sort((a, b) => (b.chunks || 0) - (a.chunks || 0)); break;
    }
    return docs;
  }, [visible, query, activeCategory, activeSourceType, sortKey]);

  const totalChunks = useMemo(() => filtered.reduce((sum, d) => sum + (d.chunks || 0), 0), [filtered]);
  const readableCount = useMemo(() => visible.filter((d) => (d.chunks || 0) > 0).length, [visible]);
  const unreadableCount = useMemo(() => visible.filter((d) => (d.chunks || 0) === 0).length, [visible]);

  return (
    <main className="min-h-screen bg-[#fbfbfa] text-[#171717]">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[260px_1fr]">
        <aside className="border-r border-[#e5e5e5] bg-[#f9f9f9] p-3">
          <div className="mb-4 rounded-xl bg-white p-3">
            <img src={LOGO_URL} alt="St. Mary's Home" className="h-14 w-auto" />
          </div>

          <nav className="space-y-1 text-sm mb-5">
            <a href="/" className="block rounded-lg px-3 py-2 text-[#444] hover:bg-[#ececec]">← AI Chat</a>
            <a href="/knowledge" className="block rounded-lg bg-[#ececec] px-3 py-2 font-medium">Knowledge Library</a>
            {isAdmin && (
              <a href="/admin/dashboard" className="block rounded-lg px-3 py-2 text-[#444] hover:bg-[#ececec]">Admin Dashboard</a>
            )}
          </nav>

          <div className="mb-5">
            <p className="mb-2 px-3 text-xs font-medium text-[#777]">Source Type</p>
            <div className="space-y-1">
              {[
                { key: "All", label: "All Sources" },
                { key: "internal", label: "Internal" },
                { key: "sharepoint", label: "SharePoint" },
                { key: "public", label: "Public / Medical" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveSourceType(key)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    activeSourceType === key ? "bg-[#ececec] font-medium text-[#171717]" : "text-[#444] hover:bg-[#ececec]"
                  }`}
                >
                  <span className="truncate">{label}</span>
                  <span className="ml-2 rounded-md bg-white px-2 py-0.5 text-xs text-[#666]">
                    {sourceTypeCounts[key] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 px-3 text-xs font-medium text-[#777]">Category</p>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setActiveCategory(cat.name)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    activeCategory === cat.name ? "bg-[#ececec] font-medium text-[#171717]" : "text-[#444] hover:bg-[#ececec]"
                  }`}
                >
                  <span className="truncate">{cat.name}</span>
                  <span className="ml-2 rounded-md bg-white px-2 py-0.5 text-xs text-[#666]">{cat.count}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-screen flex-col">
          <header className="border-b border-[#eeeeee] px-6 py-5">
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#0f766e]">St. Mary&apos;s AI Workforce</p>
                  <h1 className="mt-1 text-2xl font-semibold">Knowledge Library</h1>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[#666]">
                    Browse the approved sources, SharePoint documents, public references, and uploaded files the AI can search.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 shadow-sm">
                    <p className="text-lg font-semibold text-[#111827]">{visible.length.toLocaleString()}</p>
                    <p className="text-[11px] text-[#64748b]">Sources</p>
                  </div>
                  <div className="rounded-xl border border-[#d1fae5] bg-[#f0fdf4] px-4 py-3 shadow-sm">
                    <p className="text-lg font-semibold text-[#0f766e]">{readableCount.toLocaleString()}</p>
                    <p className="text-[11px] text-[#166534]">AI Readable</p>
                  </div>
                  <div className="rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 shadow-sm">
                    <p className="text-lg font-semibold text-[#ea580c]">{unreadableCount.toLocaleString()}</p>
                    <p className="text-[11px] text-[#9a3412]">Need Reindex</p>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mx-auto max-w-6xl space-y-4">

              {isAdmin ? (
                <section className="rounded-2xl border border-[#d9e2df] bg-white px-5 py-4 shadow-sm">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#0f766e]">Admin Actions</p>
                      <p className="mt-1 text-sm text-[#64748b]">
                        Upload and sync actions are admin-only. Staff can browse this library in read-only mode.
                      </p>
                    </div>
                    <a
                      href="/admin/sync"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d9e2df] bg-white px-3 py-2 text-sm font-medium text-[#0f766e] shadow-sm hover:border-[#0f766e] hover:bg-[#f0fdfa]"
                    >
                      <span>↻</span> Sync SharePoint
                    </a>
                  </div>

                  <form onSubmit={handleUpload} className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px_auto]">
                      <div>
                        <label className="mb-1 block text-xs text-[#555]">File</label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.docx,.txt,.md,.csv"
                          onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                          className="w-full rounded-lg border border-[#d9d9d9] bg-white px-3 py-2 text-sm outline-none focus:border-[#0f766e]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-[#555]">Title</label>
                        <input type="text" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)}
                          placeholder="Optional" className="w-full rounded-lg border border-[#d9d9d9] bg-white px-3 py-2 text-sm outline-none focus:border-[#0f766e]" />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-[#555]">Category</label>
                        <input type="text" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}
                          placeholder="Optional" className="w-full rounded-lg border border-[#d9d9d9] bg-white px-3 py-2 text-sm outline-none focus:border-[#0f766e]" />
                      </div>
                      <div className="flex items-end">
                        <button type="submit" disabled={uploading || !uploadFile}
                          className="w-full rounded-lg bg-[#0f766e] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0d6460] disabled:opacity-50 lg:w-auto">
                          {uploading ? "Uploading…" : "Upload"}
                        </button>
                      </div>
                    </div>
                    {uploadResult && (
                      <p className={`text-sm ${uploadResult.success ? "text-[#0f766e]" : "text-red-600"}`}>{uploadResult.message}</p>
                    )}
                  </form>
                </section>
              ) : (
                <section className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Read-only Library</p>
                  <p className="mt-1 text-sm leading-6 text-[#64748b]">
                    This page shows what the AI can search. New documents are added through SharePoint and synced by authorized admins.
                  </p>
                </section>
              )}

              <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-[1fr_190px_auto]">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search policies, procedures, systems, forms, SharePoint links..."
                    className="w-full rounded-xl border border-[#d9d9d9] bg-white px-4 py-3 text-sm outline-none focus:border-[#0f766e]"
                  />
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="rounded-xl border border-[#d9d9d9] bg-white px-3 py-3 text-sm text-[#374151] outline-none focus:border-[#0f766e]"
                  >
                    {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {isAdmin && (
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#e5e7eb] px-3 py-3 text-sm text-[#555]">
                      <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
                      Show inactive
                    </label>
                  )}
                </div>
              </div>

              {syncResult && <p className="text-sm text-[#0f766e]">{syncResult}</p>}

              <div className="flex flex-wrap items-center gap-2 text-xs text-[#777]">
                <span>{filtered.length} document{filtered.length !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>{totalChunks.toLocaleString()} total chunks</span>
                {activeCategory !== "All" && <><span>·</span><span className="font-medium text-[#0f766e]">{activeCategory}</span></>}
                {activeSourceType !== "All" && <><span>·</span><span className="font-medium text-[#7c3aed]">{SOURCE_TYPE_LABELS[activeSourceType]?.label}</span></>}
              </div>

              {loading && <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-sm text-[#666]">Loading knowledge library…</div>}
              {!loading && loadError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadError}</div>}
              {!loading && !loadError && filtered.length === 0 && (
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-sm text-[#666]">No documents found.</div>
              )}

              {!loadError && (
                <div className="grid gap-2.5">
                  {filtered.map((doc) => {
                    const st = SOURCE_TYPE_LABELS[(doc as any).sourceType] ?? SOURCE_TYPE_LABELS.internal;
                    return (
                      <div
                        key={doc.id}
                        className={`rounded-xl border bg-white p-4 shadow-sm transition ${
                          doc.is_active === false ? "border-red-100 opacity-60" : "border-[#e5e5e5] hover:border-[#c8d9d6]"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#171717] truncate">{doc.title}</p>
                            <p className="mt-0.5 text-xs text-[#666] truncate">{doc.source || "Unknown source"}</p>
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              <span className="rounded-md px-2 py-0.5 text-xs font-medium" style={{ color: st.color, background: st.bg }}>
                                {st.label}
                              </span>
                              <span className="rounded-md bg-[#e6f4f1] px-2 py-0.5 text-xs font-medium text-[#0f766e]">
                                {(doc as any).normalizedCategory}
                              </span>
                              <span className="rounded-md bg-[#f4f4f4] px-2 py-0.5 text-xs text-[#555]">
                                {doc.chunks} chunks
                              </span>
                              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                                (doc.chunks || 0) > 0 ? "bg-[#ecfdf5] text-[#0f766e]" : "bg-[#fff7ed] text-[#ea580c]"
                              }`}>
                                {(doc.chunks || 0) > 0 ? "AI readable" : "Needs reindex"}
                              </span>
                              <span className="rounded-md bg-[#f4f4f4] px-2 py-0.5 text-xs text-[#555]">
                                {new Date(doc.created_at).toLocaleDateString()}
                              </span>
                              {doc.is_active === false && (
                                <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">Deactivated</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {doc.source_url && (
                              <a href={doc.source_url} target="_blank" rel="noreferrer"
                                className="rounded-lg border border-[#d9d9d9] px-3 py-1.5 text-xs font-medium text-[#333] hover:bg-[#f4f4f4]">
                                Open ↗
                              </a>
                            )}
                            {isAdmin && (
                              <>
                                <button onClick={() => toggleActive(doc)} disabled={togglingId === doc.id}
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                                    doc.is_active === false
                                      ? "border-[#0f766e] text-[#0f766e] hover:bg-[#f0fdfa]"
                                      : "border-[#d9d9d9] text-[#666] hover:bg-[#f4f4f4]"
                                  }`}
                                >
                                  {togglingId === doc.id ? "…" : doc.is_active === false ? "Activate" : "Deactivate"}
                                </button>
                                <button onClick={() => deleteDoc(doc)} disabled={deletingId === doc.id}
                                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50">
                                  {deletingId === doc.id ? "…" : "Delete"}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
