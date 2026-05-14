"use client";

import { useEffect, useMemo, useState } from "react";

type FeedbackItem = {
  id: string;
  conversation_id: string | null;
  feedback_type: "helpful" | "incorrect" | "report_issue" | string;
  question: string | null;
  answer: string | null;
  sources: any;
  created_at: string;
};

function badgeClass(type: string) {
  if (type === "helpful") {
    return "bg-green-50 text-green-700 border-green-200";
  }

  if (type === "incorrect") {
    return "bg-red-50 text-red-700 border-red-200";
  }

  if (type === "report_issue") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  return "bg-gray-50 text-gray-700 border-gray-200";
}

function labelFor(type: string) {
  if (type === "helpful") return "Helpful";
  if (type === "incorrect") return "Incorrect";
  if (type === "report_issue") return "Reported Issue";
  return type;
}

export default function FeedbackAdminPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState("all");
  const [search, setSearch] = useState("");

  async function loadFeedback() {
    setLoading(true);

    try {
      const res = await fetch("/api/feedback/list", {
        cache: "no-store",
      });

      const data = await res.json();

      if (data.success) {
        setFeedback(data.feedback || []);
      }
    } catch (error) {
      console.error("Failed to load feedback:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeedback();
  }, []);

  const filteredFeedback = useMemo(() => {
    return feedback.filter((item) => {
      const matchesType =
        selectedType === "all" || item.feedback_type === selectedType;

      const query = search.toLowerCase().trim();

      const matchesSearch =
        !query ||
        item.question?.toLowerCase().includes(query) ||
        item.answer?.toLowerCase().includes(query) ||
        item.feedback_type?.toLowerCase().includes(query);

      return matchesType && matchesSearch;
    });
  }, [feedback, selectedType, search]);

  const counts = useMemo(() => {
    return {
      total: feedback.length,
      helpful: feedback.filter((item) => item.feedback_type === "helpful").length,
      incorrect: feedback.filter((item) => item.feedback_type === "incorrect")
        .length,
      reported: feedback.filter((item) => item.feedback_type === "report_issue")
        .length,
    };
  }, [feedback]);

  return (
    <main className="min-h-screen bg-[#f7f7f8] px-6 py-8 text-[#171717]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-[#0f766e]">
              St. Mary&apos;s AI Assistant
            </p>

            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              AI Feedback Admin
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#666]">
              Review helpful, incorrect, and reported AI responses. Use this to
              identify weak SOPs, outdated documents, hallucinations, and common
              staff questions.
            </p>
          </div>

          <div className="flex gap-2">
            <a
              href="/"
              className="rounded-xl border border-[#d9d9d9] bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-[#f1f1f1]"
            >
              Back to Chat
            </a>

            <button
              onClick={loadFeedback}
              className="rounded-xl bg-[#171717] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-sm">
            <p className="text-sm text-[#666]">Total Feedback</p>
            <p className="mt-2 text-3xl font-semibold">{counts.total}</p>
          </div>

          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-sm">
            <p className="text-sm text-[#666]">Helpful</p>
            <p className="mt-2 text-3xl font-semibold text-green-700">
              {counts.helpful}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-sm">
            <p className="text-sm text-[#666]">Incorrect</p>
            <p className="mt-2 text-3xl font-semibold text-red-700">
              {counts.incorrect}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-sm">
            <p className="text-sm text-[#666]">Reported Issues</p>
            <p className="mt-2 text-3xl font-semibold text-amber-700">
              {counts.reported}
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions, answers, or feedback type..."
              className="w-full rounded-xl border border-[#d9d9d9] px-4 py-2 text-sm outline-none focus:border-[#0f766e] md:max-w-xl"
            />

            <div className="flex flex-wrap gap-2">
              {[
                ["all", "All"],
                ["helpful", "Helpful"],
                ["incorrect", "Incorrect"],
                ["report_issue", "Reported"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setSelectedType(value)}
                  className={`rounded-xl border px-4 py-2 text-sm font-medium ${
                    selectedType === value
                      ? "border-[#171717] bg-[#171717] text-white"
                      : "border-[#d9d9d9] bg-white text-[#444] hover:bg-[#f1f1f1]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-8 text-center text-sm text-[#666] shadow-sm">
            Loading feedback...
          </div>
        ) : filteredFeedback.length === 0 ? (
          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-8 text-center text-sm text-[#666] shadow-sm">
            No feedback found.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredFeedback.map((item) => {
              let parsedSources: any[] = [];

              try {
                parsedSources = Array.isArray(item.sources)
                  ? item.sources
                  : JSON.parse(item.sources || "[]");
              } catch {
                parsedSources = [];
              }

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-sm"
                >
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(
                          item.feedback_type
                        )}`}
                      >
                        {labelFor(item.feedback_type)}
                      </span>

                      <p className="mt-2 text-xs text-[#777]">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>

                    {item.conversation_id && (
                      <p className="rounded-lg bg-[#f7f7f8] px-3 py-2 text-xs text-[#777]">
                        Conversation: {item.conversation_id}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-[#eeeeee] bg-[#fafafa] p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#666]">
                        User Question
                      </p>

                      <p className="whitespace-pre-wrap text-sm leading-6">
                        {item.question || "No question captured"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#eeeeee] bg-[#fafafa] p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#666]">
                        AI Answer
                      </p>

                      <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-6">
                        {item.answer || "No answer captured"}
                      </p>
                    </div>
                  </div>

                  {parsedSources.length > 0 && (
                    <div className="mt-4 rounded-xl border border-[#eeeeee] bg-white p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#666]">
                        Retrieved Sources
                      </p>

                      <div className="grid gap-2 md:grid-cols-2">
                        {parsedSources.slice(0, 6).map((source, sourceIndex) => (
                          <div
                            key={`${item.id}-${sourceIndex}`}
                            className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3 text-xs"
                          >
                            <p className="font-medium text-[#222]">
                              {source.title || source.sourceUrl || "Untitled"}
                            </p>

                            <p className="mt-1 text-[#666]">
                              {source.category || "Unknown"}{" "}
                              {typeof source.similarity === "number"
                                ? `· Match ${Math.round(
                                    source.similarity * 100
                                  )}%`
                                : ""}
                            </p>

                            {source.sourceUrl && (
                              <a
                                href={source.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex text-[#0f766e] hover:underline"
                              >
                                Open source
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}