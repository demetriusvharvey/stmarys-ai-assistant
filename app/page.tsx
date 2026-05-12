"use client";

import { useEffect, useRef, useState } from "react";

type Source = {
  id: string;
  documentId: string;
  title: string;
  category: string;
  source: string;
  sourceUrl: string;
  similarity: number;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

const LOGO_URL =
  "https://saintmaryshome.org/wp-content/uploads/2025/05/SMH-Logo-2025_LinearStackedTagline-Color.svg";

const STARTER_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hi, I’m the St. Mary’s AI Knowledge Assistant. Ask me about approved policies, SOPs, IT procedures, onboarding docs, SigmaCare, CareTracker, or SharePoint knowledge.",
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([STARTER_MESSAGE]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );

  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [category, setCategory] = useState("IT");
  const [uploadStatus, setUploadStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    setLoadingChats(true);

    try {
      const res = await fetch("/api/conversations", {
        cache: "no-store",
      });

      const data = await res.json();

      if (data.success) {
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setLoadingChats(false);
    }
  }

  async function createConversation(title = "New Chat") {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to create conversation");
    }

    await loadConversations();

    return data.conversation as Conversation;
  }

  async function saveMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
    sources?: Source[]
  ) {
    await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId,
        role,
        content,
        sources: sources || null,
      }),
    });

    await loadConversations();
  }

  async function newChat() {
    try {
      const conversation = await createConversation("New Chat");

      setActiveConversationId(conversation.id);
      setMessages([
        {
          role: "assistant",
          content:
            "Hi, I’m the St. Mary’s AI Knowledge Assistant. What would you like to know?",
        },
      ]);
      setQuestion("");
    } catch (error: any) {
      console.error(error);
    }
  }

  async function loadConversation(conversationId: string) {
    setActiveConversationId(conversationId);
    setLoading(true);

    try {
      const res = await fetch(
        `/api/messages?conversationId=${conversationId}`,
        {
          cache: "no-store",
        }
      );

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to load messages");
      }

      const loadedMessages: Message[] = (data.messages || []).map(
        (message: any) => ({
          role: message.role,
          content: message.content,
          sources: message.sources || [],
        })
      );

      setMessages(loadedMessages.length > 0 ? loadedMessages : [STARTER_MESSAGE]);
    } catch (error: any) {
      setMessages([
        {
          role: "assistant",
          content: `Error loading conversation: ${error.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function askQuestion() {
    if (!question.trim() || loading) return;

    let conversationId = activeConversationId;

    try {
      if (!conversationId) {
        const conversation = await createConversation(question.slice(0, 60));
        conversationId = conversation.id;
        setActiveConversationId(conversation.id);
      }

      const currentQuestion = question;

      setMessages((prev) => [
        ...prev,
        { role: "user", content: currentQuestion },
      ]);

      setQuestion("");
      setLoading(true);

      await saveMessage(conversationId, "user", currentQuestion);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: currentQuestion,
          userEmail: "demo@stmarys.local",
        }),
      });

      const data = await res.json();

      const assistantContent = data.success
        ? data.answer
        : `Error: ${data.error || "Something went wrong"}`;

      const assistantSources = data.success ? data.sources || [] : [];

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantContent,
          sources: assistantSources,
        },
      ]);

      await saveMessage(
        conversationId,
        "assistant",
        assistantContent,
        assistantSources
      );
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function uploadPdf() {
    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setUploadStatus("Please select a PDF.");
      return;
    }

    setUploading(true);
    setUploadStatus("Processing document...");

    try {
      const formData = new FormData();

      formData.append("file", file);
      formData.append("category", category);
      formData.append("source", "Manual Upload");

      const res = await fetch("/api/ingest-pdf", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setUploadStatus(
          `Uploaded ${data.fileName} · ${data.chunksStored} chunks · ${data.extractionMethod}`
        );

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        setUploadStatus(`Error: ${data.error}`);
      }
    } catch (error: any) {
      setUploadStatus(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function syncSharePoint() {
    setSyncing(true);
    setSyncStatus("Creating SharePoint sync job...");

    try {
      const res = await fetch("/api/sharepoint/sync/jobs", {
        method: "POST",
      });

      const data = await res.json();

      if (data.success) {
        setSyncStatus("Sync job created. Open Sync Admin to process queued files.");
      } else {
        setSyncStatus(`Error: ${data.error}`);
      }
    } catch (error: any) {
      setSyncStatus(`Error: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="h-screen overflow-hidden bg-white text-[#171717]">
      <div className="grid h-screen grid-cols-1 overflow-hidden md:grid-cols-[280px_1fr]">
        <aside className="hidden h-screen overflow-y-auto border-r border-[#e5e5e5] bg-[#f7f7f8] p-3 md:flex md:flex-col">
          <div className="mb-4 rounded-xl bg-white p-3 shadow-sm">
            <img src={LOGO_URL} alt="St. Mary's Home" className="h-14 w-auto" />
          </div>

          <button
            onClick={newChat}
            className="mb-3 rounded-xl border border-[#d9d9d9] bg-white px-3 py-2.5 text-left text-sm font-medium shadow-sm hover:bg-[#f1f1f1]"
          >
            + New Chat
          </button>

          <nav className="space-y-1 text-sm">
            <button className="w-full rounded-lg bg-[#ececec] px-3 py-2 text-left font-medium">
              AI Knowledge Chat
            </button>

            <a
              href="/knowledge"
              className="block rounded-lg px-3 py-2 text-[#444] hover:bg-[#ececec]"
            >
              Knowledge Library
            </a>

            <a
              href="/admin/sync"
              className="block rounded-lg px-3 py-2 text-[#444] hover:bg-[#ececec]"
            >
              Sync Admin
            </a>

            <button
              onClick={syncSharePoint}
              disabled={syncing}
              className="w-full rounded-lg px-3 py-2 text-left text-[#444] hover:bg-[#ececec] disabled:opacity-50"
            >
              {syncing ? "Creating Sync Job..." : "Queue SharePoint Sync"}
            </button>
          </nav>

          {syncStatus && (
            <div className="mt-3 rounded-lg border border-[#e5e5e5] bg-white p-3 text-xs leading-5 text-[#555] shadow-sm">
              {syncStatus}
            </div>
          )}

          <div className="mt-6">
            <p className="mb-2 px-3 text-xs font-medium text-[#777]">
              Recent chats
            </p>

            <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
              {loadingChats && (
                <p className="px-3 py-2 text-xs text-[#777]">
                  Loading chats...
                </p>
              )}

              {!loadingChats && conversations.length === 0 && (
                <p className="px-3 py-2 text-xs text-[#777]">
                  No saved chats yet.
                </p>
              )}

              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => loadConversation(conversation.id)}
                  className={`w-full truncate rounded-lg px-3 py-2 text-left hover:bg-[#ececec] ${
                    activeConversationId === conversation.id
                      ? "bg-[#ececec] text-[#111]"
                      : "text-[#444]"
                  }`}
                  title={conversation.title}
                >
                  {conversation.title || "New Chat"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto space-y-3 pt-4">
            <div className="rounded-xl border border-[#e5e5e5] bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-[#333]">
                Manual Upload
              </p>

              <div className="mt-3 space-y-3">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-[#d9d9d9] bg-white px-3 py-2 text-xs outline-none"
                >
                  <option>IT</option>
                  <option>Onboarding</option>
                  <option>SigmaCare</option>
                  <option>CareTracker</option>
                  <option>Policies</option>
                  <option>Training</option>
                </select>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-[#0f766e] file:px-2 file:py-1.5 file:text-xs file:text-white"
                />

                <button
                  onClick={uploadPdf}
                  disabled={uploading}
                  className="w-full rounded-lg bg-[#0f766e] px-3 py-2 text-xs font-semibold text-white hover:bg-[#115e59] disabled:opacity-50"
                >
                  {uploading ? "Uploading..." : "Upload PDF"}
                </button>

                {uploadStatus && (
                  <p className="text-xs leading-5 text-[#666]">
                    {uploadStatus}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-white p-3 text-xs leading-5 text-[#666] shadow-sm">
              <p className="font-semibold text-[#333]">Safety Rules</p>
              <p>Read-only · No medical advice · Source-based answers</p>
            </div>
          </div>
        </aside>

        <section className="flex h-screen min-h-0 flex-col bg-white">
          <header className="flex items-center justify-between border-b border-[#eeeeee] px-4 py-3 md:hidden">
            <img src={LOGO_URL} alt="St. Mary's Home" className="h-10 w-auto" />

            <div className="flex items-center gap-2">
              <a
                href="/admin/sync"
                className="rounded-lg border border-[#d9d9d9] px-3 py-2 text-sm"
              >
                Sync
              </a>

              <button
                onClick={newChat}
                className="rounded-lg border border-[#d9d9d9] px-3 py-2 text-sm"
              >
                New
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8">
            <div className="mx-auto max-w-3xl">
              {messages.length <= 1 && (
                <div className="mb-10 mt-8 text-center">
                  <img
                    src={LOGO_URL}
                    alt="St. Mary's Home"
                    className="mx-auto mb-6 h-20 w-auto"
                  />

                  <h1 className="text-3xl font-semibold tracking-tight">
                    St. Mary&apos;s AI Knowledge Assistant
                  </h1>

                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#666]">
                    Ask questions across approved SharePoint documents, SOPs,
                    policies, onboarding materials, IT guides, and operational
                    knowledge.
                  </p>
                </div>
              )}

              <div className="space-y-5">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-3xl px-5 py-4 text-sm leading-7 shadow-sm ${
                        message.role === "user"
                          ? "bg-[#ececec] text-[#171717]"
                          : "bg-[#f7f7f8] text-[#171717]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>

                      {message.role === "assistant" &&
                        message.sources &&
                        message.sources.length > 0 && (
                          <div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-white p-3">
                            <p className="mb-2 text-xs font-semibold text-[#555]">
                              Sources
                            </p>

                            <div className="space-y-2">
                              {message.sources.slice(0, 4).map((source) => (
                                <div
                                  key={source.id}
                                  className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3 text-xs"
                                >
                                  <p className="font-medium text-[#222]">
                                    {source.title || source.sourceUrl}
                                  </p>

                                  <p className="mt-1 text-[#666]">
                                    {source.category || "Unknown"} · Match{" "}
                                    {Math.round(
                                      Number(source.similarity || 0) * 100
                                    )}
                                    %
                                  </p>

                                  {source.sourceUrl && (
                                    <a
                                      href={source.sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-2 inline-flex rounded-md bg-[#e6f4f1] px-2 py-1 text-[10px] font-medium text-[#0f766e] hover:bg-[#d4eee9]"
                                    >
                                      Open document
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-3xl bg-[#f7f7f8] px-5 py-4 text-sm text-[#666] shadow-sm">
                      Searching approved knowledge...
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-[#eeeeee] bg-white px-4 py-4">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-3 rounded-2xl border border-[#d9d9d9] bg-white px-4 py-3 shadow-sm">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      askQuestion();
                    }
                  }}
                  placeholder="Message St. Mary's AI..."
                  rows={1}
                  className="max-h-32 flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-[#999]"
                />

                <button
                  onClick={askQuestion}
                  disabled={loading}
                  className="rounded-xl bg-[#171717] px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
                >
                  Send
                </button>
              </div>

              <p className="mt-2 text-center text-xs text-[#888]">
                Answers should be verified against source documents before
                operational use.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}