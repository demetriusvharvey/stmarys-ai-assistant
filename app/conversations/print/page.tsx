"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function PrintContent() {
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("id");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!conversationId) { setError("No conversation ID"); setLoading(false); return; }

    Promise.all([
      fetch(`/api/conversations/${conversationId}`).then((r) => r.json()),
      fetch(`/api/messages?conversationId=${conversationId}`).then((r) => r.json()),
    ])
      .then(([convData, msgData]) => {
        setConversation(convData.conversation || null);
        setMessages(msgData.messages || []);
        setLoading(false);
        // Auto-print after content loads
        setTimeout(() => window.print(), 800);
      })
      .catch(() => { setError("Failed to load conversation"); setLoading(false); });
  }, [conversationId]);

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-gray-400 animate-pulse">Preparing for print…</p>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-red-500">{error}</p>
    </div>
  );

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { margin: 1in; }
        }
        body { font-family: Arial, sans-serif; background: white; color: #111827; }
      `}</style>

      {/* Print toolbar — hidden when printing */}
      <div className="no-print fixed top-0 left-0 right-0 bg-gray-100 border-b px-6 py-3 flex items-center justify-between z-50">
        <p className="text-sm text-gray-600">Preview — click Print to save as PDF</p>
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-[#0f766e] text-white rounded-lg text-sm font-medium hover:bg-[#115e59]"
          >
            🖨️ Print / Save PDF
          </button>
          <button onClick={() => window.close()} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>

      {/* Printable content */}
      <div className="pt-16 no-print-padding max-w-3xl mx-auto px-8 py-10" style={{ paddingTop: "64px" }}>
        {/* Header */}
        <div className="border-b-2 border-[#0f766e] pb-4 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">St. Mary's AI Workforce</p>
              <h1 className="text-xl font-bold text-gray-900">{conversation?.title || "Conversation"}</h1>
              {conversation?.created_at && (
                <p className="text-sm text-gray-500 mt-1">Started: {formatDate(conversation.created_at)}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Printed: {formatDate(new Date().toISOString())}</p>
              <p className="text-xs text-gray-400 mt-1">{messages.length} message{messages.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-5">
          {messages.map((msg) => (
            <div key={msg.id} className={msg.role === "user" ? "ml-8" : "mr-8"}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold uppercase tracking-wide ${msg.role === "user" ? "text-[#0f766e]" : "text-gray-500"}`}>
                  {msg.role === "user" ? "Staff" : "AI Assistant"}
                </span>
                <span className="text-xs text-gray-400">{formatDate(msg.created_at)}</span>
              </div>
              <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap border ${
                msg.role === "user"
                  ? "bg-[#f0fdf4] border-[#bbf7d0] text-gray-800"
                  : "bg-gray-50 border-gray-200 text-gray-800"
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 pt-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">
            St. Mary's Home for Disabled Children · AI Workforce Assistant · Confidential — For internal use only
          </p>
          <p className="text-xs text-gray-300 mt-1">
            Do not include Protected Health Information (PHI) in AI conversations. Verify all answers against official St. Mary's policies.
          </p>
        </div>
      </div>
    </>
  );
}

export default function PrintConversationPage() {
  return (
    <Suspense>
      <PrintContent />
    </Suspense>
  );
}
