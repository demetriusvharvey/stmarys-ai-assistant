"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: unknown;
  created_at: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function ConversationsPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((d) => {
        if (d?.conversations) setConversations(d.conversations);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  async function openConversation(conv: Conversation) {
    setSelected(conv);
    setMessagesLoading(true);
    setMessages([]);
    const res = await fetch(`/api/messages?conversationId=${conv.id}`);
    const data = await res.json();
    if (data.messages) setMessages(data.messages);
    setMessagesLoading(false);
  }

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen bg-[#f8faf9]">
      {/* Sidebar */}
      <div className="flex w-80 shrink-0 flex-col border-r border-[#e5e7eb] bg-white">
        {/* Header */}
        <div className="border-b border-[#e5e7eb] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-base font-semibold text-[#111827]">Chat History</h1>
            <button
              onClick={() => router.push("/")}
              className="rounded-lg bg-[#0f766e] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#115e59]"
            >
              ← Chat
            </button>
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm text-[#374151] placeholder:text-[#9ca3af] focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="animate-pulse text-sm text-[#9ca3af]">Loading…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-[#9ca3af]">
                {search ? "No conversations match." : "No conversations yet."}
              </p>
              {!search && (
                <button
                  onClick={() => router.push("/")}
                  className="mt-3 text-sm text-[#0f766e] underline"
                >
                  Start your first chat
                </button>
              )}
            </div>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.id}
                onClick={() => openConversation(conv)}
                className={`w-full border-b border-[#f3f4f6] px-4 py-3 text-left transition hover:bg-[#f0fdf4] ${
                  selected?.id === conv.id ? "bg-[#f0fdf4] border-l-2 border-l-[#0f766e]" : ""
                }`}
              >
                <p className="truncate text-sm font-medium text-[#111827]">{conv.title}</p>
                <p className="mt-0.5 text-xs text-[#9ca3af]">
                  {timeAgo(conv.updated_at)}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-[#e5e7eb] px-4 py-3">
          <p className="text-xs text-[#9ca3af]">{conversations.length} conversation{conversations.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Main panel */}
      <div className="flex flex-1 flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mb-3 text-4xl">💬</div>
              <p className="text-[#6b7280]">Select a conversation to view</p>
            </div>
          </div>
        ) : (
          <>
            {/* Conv header */}
            <div className="border-b border-[#e5e7eb] bg-white px-6 py-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-[#111827]">{selected.title}</h2>
                <p className="text-xs text-[#9ca3af]">Started {formatDate(selected.created_at)}</p>
              </div>
              <a
                href={`/conversations/print?id=${selected.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 rounded-lg border border-[#e5e7eb] px-3 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#f9fafb] flex items-center gap-1.5"
              >
                🖨️ Export PDF
              </a>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <p className="animate-pulse text-sm text-[#9ca3af]">Loading messages…</p>
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-[#9ca3af] py-12">No messages in this conversation.</p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#0f766e] text-white rounded-br-sm"
                          : "bg-white border border-[#e5e7eb] text-[#111827] rounded-bl-sm shadow-sm"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p
                        className={`mt-1.5 text-[10px] ${
                          msg.role === "user" ? "text-[#99f6e4]" : "text-[#9ca3af]"
                        }`}
                      >
                        {formatDate(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Continue button */}
            <div className="border-t border-[#e5e7eb] bg-white px-6 py-3">
              <button
                onClick={() => router.push(`/?conversationId=${selected.id}`)}
                className="rounded-lg bg-[#0f766e] px-4 py-2 text-sm font-medium text-white hover:bg-[#115e59]"
              >
                Continue this conversation →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
