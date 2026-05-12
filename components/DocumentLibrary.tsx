"use client";

import { useEffect, useState } from "react";

type DocumentItem = {
  id: string;
  title: string;
  category: string;
  source: string;
  created_at: string;
  chunks: number;
};

export default function DocumentLibrary() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadDocuments() {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();

      if (data.success) {
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  return (
    <section className="mt-4 rounded-xl border border-white/10 bg-[#1f1f1f] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Knowledge Library
        </h2>

        <span className="rounded-md bg-white/10 px-2 py-1 text-xs text-zinc-300">
          {documents.length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {loading && (
          <p className="text-xs text-zinc-500">
            Loading documents...
          </p>
        )}

        {!loading && documents.length === 0 && (
          <p className="text-xs text-zinc-500">
            No documents uploaded yet.
          </p>
        )}

        {documents.map((doc) => (
          <div
            key={doc.id}
            className="rounded-lg border border-white/10 bg-black/20 p-3"
          >
            <p className="line-clamp-2 text-xs font-medium text-zinc-100">
              {doc.title}
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-md bg-blue-500/20 px-2 py-1 text-[10px] text-blue-200">
                {doc.category}
              </span>

              <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] text-zinc-300">
                {doc.chunks} chunks
              </span>
            </div>

            <p className="mt-2 text-[10px] text-zinc-500">
              {new Date(doc.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}