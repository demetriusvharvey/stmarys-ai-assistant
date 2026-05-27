"use client";

import { useEffect, useMemo, useState } from "react";

type DocumentItem = {
  id: string;
  title: string;
  category: string;
  source: string;
  created_at: string;
  chunks: number;
  source_url?: string;
};

const LOGO_URL =
  "https://saintmaryshome.org/wp-content/uploads/2025/05/SMH-Logo-2025_LinearStackedTagline-Color.svg";

function normalizeCategory(doc: DocumentItem) {
  const value = `${doc.category || ""} ${doc.source || ""} ${
    doc.title || ""
  }`.toLowerCase();

  if (value.includes("caretracker")) return "CareTracker";
  if (value.includes("sigmacare")) return "SigmaCare";
  if (value.includes("onboarding")) return "Onboarding";
  if (value.includes("policy") || value.includes("policies")) return "Policies";
  if (
    value.includes("baa") ||
    value.includes("soc") ||
    value.includes("iso") ||
    value.includes("compliance")
  )
    return "Compliance / BAA / SOC";
  if (
    value.includes("ascom") ||
    value.includes("myco") ||
    value.includes("phone") ||
    value.includes("nurse call")
  )
    return "Phone System / Ascom / Myco";
  if (value.includes("vendor") || value.includes("contract"))
    return "Vendors / Contracts";
  if (value.includes("training")) return "Training";
  if (value.includes("human") || value.includes("hr")) return "Human Resources";
  if (value.includes("nursing") || value.includes("nurse")) return "Nursing";
  if (value.includes("sharepoint")) return "SharePoint";
  if (value.includes("it")) return "IT";

  return doc.category || "Other";
}

export default function KnowledgePage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  async function loadDocuments() {
    try {
      const res = await fetch("/api/documents");
      const contentType = res.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        setLoadError(
          "Unable to load the Knowledge Library. Admin access may be required."
        );
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setLoadError(data.error || "Unable to load the Knowledge Library.");
        return;
      }

      if (data.success) {
        setDocuments(data.documents || []);
        setLoadError(null);
      } else {
        setLoadError(data.error || "Unable to load the Knowledge Library.");
      }
    } catch (error) {
      console.error(error);
      setLoadError("Unable to load the Knowledge Library.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  const enrichedDocs = useMemo(() => {
    return documents.map((doc) => ({
      ...doc,
      normalizedCategory: normalizeCategory(doc),
    }));
  }, [documents]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();

    for (const doc of enrichedDocs) {
      counts.set(
        doc.normalizedCategory,
        (counts.get(doc.normalizedCategory) || 0) + 1
      );
    }

    return [
      { name: "All", count: enrichedDocs.length },
      ...Array.from(counts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ];
  }, [enrichedDocs]);

  const filteredDocs = useMemo(() => {
    const q = query.toLowerCase().trim();

    return enrichedDocs.filter((doc) => {
      const matchesCategory =
        activeCategory === "All" || doc.normalizedCategory === activeCategory;

      const matchesQuery =
        !q ||
        doc.title?.toLowerCase().includes(q) ||
        doc.source?.toLowerCase().includes(q) ||
        doc.category?.toLowerCase().includes(q) ||
        doc.normalizedCategory?.toLowerCase().includes(q);

      return matchesCategory && matchesQuery;
    });
  }, [enrichedDocs, query, activeCategory]);

  return (
    <main className="min-h-screen bg-white text-[#171717]">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[280px_1fr]">
        <aside className="border-r border-[#e5e5e5] bg-[#f9f9f9] p-3">
          <div className="mb-4 rounded-xl bg-white p-3">
            <img src={LOGO_URL} alt="St. Mary's Home" className="h-14 w-auto" />
          </div>

          <nav className="space-y-1 text-sm">
            <a
              href="/"
              className="block rounded-lg px-3 py-2 text-[#444] hover:bg-[#ececec]"
            >
              AI Knowledge Chat
            </a>

            <a
              href="/knowledge"
              className="block rounded-lg bg-[#ececec] px-3 py-2 font-medium"
            >
              Knowledge Library
            </a>
          </nav>

          <div className="mt-6">
            <p className="mb-2 px-3 text-xs font-medium text-[#777]">
              Categories
            </p>

            <div className="space-y-1">
              {categories.map((category) => (
                <button
                  key={category.name}
                  onClick={() => setActiveCategory(category.name)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    activeCategory === category.name
                      ? "bg-[#ececec] font-medium text-[#171717]"
                      : "text-[#444] hover:bg-[#ececec]"
                  }`}
                >
                  <span className="truncate">{category.name}</span>
                  <span className="ml-2 rounded-md bg-white px-2 py-0.5 text-xs text-[#666]">
                    {category.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-screen flex-col">
          <header className="border-b border-[#eeeeee] px-6 py-5">
            <div className="mx-auto max-w-6xl">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#0f766e]">
                St. Mary&apos;s Home
              </p>

              <h1 className="mt-2 text-2xl font-semibold">
                Knowledge Library
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#666]">
                Browse approved documents synced from SharePoint, manual
                uploads, SOPs, policies, onboarding files, and operational
                knowledge.
              </p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="mx-auto max-w-6xl">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {filteredDocs.length} documents
                  </p>
                  <p className="text-xs text-[#777]">
                    Category: {activeCategory}
                  </p>
                </div>

                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search documents..."
                  className="w-full rounded-xl border border-[#d9d9d9] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#0f766e] md:w-80"
                />
              </div>

              {loading && (
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-sm text-[#666]">
                  Loading knowledge library...
                </div>
              )}

              {!loading && loadError && (
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-sm text-[#666]">
                  {loadError}
                </div>
              )}

              {!loading && !loadError && filteredDocs.length === 0 && (
                <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-6 text-sm text-[#666]">
                  No documents found.
                </div>
              )}

              {!loadError && <div className="grid gap-3">
                {filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-[#e5e5e5] bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[#171717]">
                          {doc.title}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-[#666]">
                          {doc.source || "Unknown source"}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-md bg-[#e6f4f1] px-2 py-1 text-xs font-medium text-[#0f766e]">
                            {(doc as any).normalizedCategory}
                          </span>

                          <span className="rounded-md bg-[#f4f4f4] px-2 py-1 text-xs text-[#555]">
                            {doc.chunks} chunks
                          </span>

                          <span className="rounded-md bg-[#f4f4f4] px-2 py-1 text-xs text-[#555]">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {doc.source_url && (
                        <a
                          href={doc.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-[#d9d9d9] px-3 py-2 text-sm font-medium text-[#333] hover:bg-[#f4f4f4]"
                        >
                          Open
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
