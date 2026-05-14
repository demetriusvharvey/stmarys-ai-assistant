"use client";

import { ClipboardEvent, useEffect, useRef, useState } from "react";

type Source = {
  id: string;
  documentId: string;
  title: string;
  category: string;
  source: string;
  sourceUrl: string;
  similarity: number;
};

type Escalation = {
  team: string | null;
  urgency: "low" | "medium" | "high";
  recommendedNextStep: string | null;
  shouldEscalate: boolean;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  escalation?: Escalation;
  trainingMode?: boolean;
  imageUrl?: string;
  imageName?: string;
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

function urgencyClass(urgency: Escalation["urgency"]) {
  if (urgency === "high") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (urgency === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

function urgencyLabel(urgency: Escalation["urgency"]) {
  if (urgency === "high") return "High urgency";
  if (urgency === "medium") return "Medium urgency";
  return "Low urgency";
}


export default function Home() {
  const [messages, setMessages] = useState<Message[]>([STARTER_MESSAGE]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );

  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [category, setCategory] = useState("IT");
  const [uploadStatus, setUploadStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  function handleImageSelect(file: File | null) {
    setSelectedImage(file);

    setImagePreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function handleImagePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();

        if (file) {
          const pastedImage = new File(
            [file],
            `pasted-screenshot-${Date.now()}.png`,
            { type: file.type || "image/png" }
          );

          handleImageSelect(pastedImage);
          e.preventDefault();
          return;
        }
      }
    }
  }

  async function copyMessage(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);

      setTimeout(() => {
        setCopiedIndex(null);
      }, 1500);
    } catch (error) {
      console.error("Failed to copy message:", error);
    }
  }

  function printMessage(message: Message) {
    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) return;

    const safeContent = message.content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br />");

    const sourceHtml =
      message.sources && message.sources.length > 0
        ? `
          <h2>Sources</h2>
          <ul>
            ${message.sources
              .slice(0, 6)
              .map(
                (source) => `
                  <li>
                    <strong>${source.title || "Untitled source"}</strong><br />
                    ${source.category || "Unknown category"}
                    ${
                      source.sourceUrl
                        ? `<br /><a href="${source.sourceUrl}">${source.sourceUrl}</a>`
                        : ""
                    }
                  </li>
                `
              )
              .join("")}
          </ul>
        `
        : "";

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>St. Mary's AI Assistant Response</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 32px;
              color: #111827;
              line-height: 1.6;
            }
            .header {
              border-bottom: 1px solid #e5e7eb;
              margin-bottom: 24px;
              padding-bottom: 16px;
            }
            h1 {
              font-size: 22px;
              margin: 0;
            }
            h2 {
              margin-top: 28px;
              font-size: 16px;
            }
            .content {
              white-space: normal;
              font-size: 14px;
            }
            li {
              margin-bottom: 12px;
              font-size: 13px;
            }
            a {
              color: #0f766e;
              word-break: break-all;
            }
            .footer {
              margin-top: 32px;
              padding-top: 16px;
              border-top: 1px solid #e5e7eb;
              font-size: 11px;
              color: #6b7280;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>St. Mary's AI Assistant Response</h1>
          </div>

          <div class="content">${safeContent}</div>

          ${sourceHtml}

          <div class="footer">
            Answers should be verified against source documents before operational use.
          </div>

          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

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
      handleImageSelect(null);
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
    if ((!question.trim() && !selectedImage) || loading) return;

    let conversationId = activeConversationId;

    try {
      if (!conversationId) {
        const conversation = await createConversation(
          question.trim() ? question.slice(0, 60) : "Image conversation"
        );
        conversationId = conversation.id;
        setActiveConversationId(conversation.id);
      }

      const currentQuestion = question.trim();
      const imageFile = selectedImage;
      const currentImagePreviewUrl = imagePreviewUrl;

      const userContent = currentQuestion || "";

      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: userContent,
          imageUrl: currentImagePreviewUrl || undefined,
          imageName: imageFile?.name,
        },
      ]);

      setQuestion("");
      setSelectedImage(null);
      setImagePreviewUrl(null);
      setLoading(true);

      await saveMessage(
        conversationId,
        "user",
        imageFile ? currentQuestion || "[Image uploaded]" : currentQuestion
      );

      if (imageFile) {
        const formData = new FormData();

        formData.append("image", imageFile);
        formData.append("question", currentQuestion);
        formData.append("conversationId", conversationId);

        const res = await fetch("/api/analyze-image", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        const assistantContent = data.success
          ? data.answer
          : `Error: ${data.error || "Something went wrong analyzing the image."}`;

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

        return;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: currentQuestion,
          userEmail: "demo@stmarys.local",
          conversationId,
        }),
      });

      const data = await res.json();

      const assistantContent = data.success
        ? data.answer
        : `Error: ${data.error || "Something went wrong"}`;

      const assistantSources = data.success ? data.sources || [] : [];
      const assistantEscalation = data.success ? data.escalation || null : null;
      const assistantTrainingMode = data.success ? data.trainingMode || false : false;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantContent,
          sources: assistantSources,
          escalation: assistantEscalation || undefined,
          trainingMode: assistantTrainingMode,
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
                <p className="px-3 py-2 text-xs text-[#777]">Loading chats...</p>
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
              <p className="text-xs font-semibold text-[#333]">Manual Upload</p>

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
                  <p className="text-xs leading-5 text-[#666]">{uploadStatus}</p>
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

                  <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[#666]">
                    Ask questions across approved SharePoint documents, SOPs,
                    policies, onboarding materials, IT guides, operational
                    workflows, screenshots, and internal knowledge.
                  </p>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                    {[
                      "Reset voicemail",
                      "Explain this screenshot",
                      "How do I onboard a user?",
                      "CareTracker kiosk issue",
                      "Printer troubleshooting",
                      "SigmaCare access help",
                      "Setup Outlook on iPhone",
                      "SharePoint sync status",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => setQuestion(prompt)}
                        className="rounded-full border border-[#d9d9d9] bg-white px-4 py-2 text-xs font-medium text-[#444] shadow-sm transition hover:bg-[#f7f7f8]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
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
                      {message.imageUrl && (
                        <img
                          src={message.imageUrl}
                          alt={message.imageName || "Uploaded image"}
                          className="mb-3 max-h-[420px] w-full rounded-2xl object-contain"
                        />
                      )}

                      {message.content && (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}

                      {message.role === "assistant" && message.content && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => copyMessage(message.content, index)}
                            className="rounded-lg border border-[#d9d9d9] bg-white px-3 py-1.5 text-xs font-medium text-[#444] hover:bg-[#f1f1f1]"
                          >
                            {copiedIndex === index ? "Copied" : "Copy"}
                          </button>

                          <button
                            onClick={() => printMessage(message)}
                            className="rounded-lg border border-[#d9d9d9] bg-white px-3 py-1.5 text-xs font-medium text-[#444] hover:bg-[#f1f1f1]"
                          >
                            Print
                          </button>

                          <button
                            onClick={async () => {
                              await fetch("/api/feedback", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  conversationId: activeConversationId,
                                  feedbackType: "helpful",
                                  question:
                                    messages[index - 1]?.role === "user"
                                      ? messages[index - 1]?.content
                                      : null,
                                  answer: message.content,
                                  sources: message.sources || [],
                                }),
                              });

                              alert("Helpful feedback saved");
                            }}
                            className="rounded-lg border border-[#d9d9d9] bg-white px-3 py-1.5 text-xs font-medium text-[#444] hover:bg-[#f1f1f1]"
                          >
                            👍 Helpful
                          </button>

                          <button
                            onClick={async () => {
                              await fetch("/api/feedback", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  conversationId: activeConversationId,
                                  feedbackType: "incorrect",
                                  question:
                                    messages[index - 1]?.role === "user"
                                      ? messages[index - 1]?.content
                                      : null,
                                  answer: message.content,
                                  sources: message.sources || [],
                                }),
                              });

                              alert("Incorrect feedback saved");
                            }}
                            className="rounded-lg border border-[#d9d9d9] bg-white px-3 py-1.5 text-xs font-medium text-[#444] hover:bg-[#f1f1f1]"
                          >
                            👎 Incorrect
                          </button>

                          <button
                            onClick={async () => {
                              await fetch("/api/feedback", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  conversationId: activeConversationId,
                                  feedbackType: "report_issue",
                                  question:
                                    messages[index - 1]?.role === "user"
                                      ? messages[index - 1]?.content
                                      : null,
                                  answer: message.content,
                                  sources: message.sources || [],
                                }),
                              });

                              alert("Issue reported");
                            }}
                            className="rounded-lg border border-[#d9d9d9] bg-white px-3 py-1.5 text-xs font-medium text-[#444] hover:bg-[#f1f1f1]"
                          >
                            ⚠ Report Issue
                          </button>
                        </div>
                      )}

                      {message.role === "assistant" && message.trainingMode && (
                        <div className="mt-4 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-3">
                          <div className="flex items-start gap-3">
                            <div className="rounded-full bg-[#dbeafe] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1d4ed8]">
                              Training Mode
                            </div>

                            <div>
                              <p className="text-sm font-semibold text-[#1e3a8a]">
                                Step-by-step operational workflow
                              </p>

                              <p className="mt-1 text-xs leading-5 text-[#4b5563]">
                                This response is structured for onboarding, setup, or procedural guidance.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {message.role === "assistant" &&
                        message.escalation?.shouldEscalate && (
                          <div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-white p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-[#666]">
                                  Recommended Escalation
                                </p>

                                <p className="mt-1 text-sm font-semibold text-[#222]">
                                  {message.escalation.team || "Supervisor / Leadership"}
                                </p>

                                {message.escalation.recommendedNextStep && (
                                  <p className="mt-2 text-xs leading-5 text-[#666]">
                                    {message.escalation.recommendedNextStep}
                                  </p>
                                )}
                              </div>

                              <span
                                className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${urgencyClass(
                                  message.escalation.urgency
                                )}`}
                              >
                                {urgencyLabel(message.escalation.urgency)}
                              </span>
                            </div>
                          </div>
                        )}

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
                      Thinking...
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-[#eeeeee] bg-white px-4 py-4">
            <div className="mx-auto max-w-3xl">
              {imagePreviewUrl && (
                <div className="mb-3 rounded-2xl border border-[#d9d9d9] bg-[#f7f7f8] p-3">
                  <div className="flex items-start gap-3">
                    <img
                      src={imagePreviewUrl}
                      alt="Selected image"
                      className="h-24 w-32 rounded-xl object-cover"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#222]">
                        {selectedImage?.name}
                      </p>
                      <p className="mt-1 text-xs text-[#666]">
                        Image ready. Add a question or press Send.
                      </p>
                    </div>

                    <button
                      onClick={() => handleImageSelect(null)}
                      className="rounded-lg border border-[#d9d9d9] bg-white px-3 py-1.5 text-xs hover:bg-[#f1f1f1]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-end gap-3 rounded-2xl border border-[#d9d9d9] bg-white px-4 py-3 shadow-sm">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    handleImageSelect(e.target.files?.[0] || null)
                  }
                />

                <button
                  onClick={() => imageInputRef.current?.click()}
                  disabled={loading}
                  className="rounded-xl border border-[#d9d9d9] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#f7f7f8] disabled:opacity-50"
                  title="Attach image"
                >
                  +
                </button>

                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onPaste={handleImagePaste}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      askQuestion();
                    }
                  }}
                  placeholder={
                    selectedImage
                      ? "Ask about this image..."
                      : "Message St. Mary's AI..."
                  }
                  rows={1}
                  className="max-h-32 flex-1 resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-[#999]"
                />

                <button
                  onClick={askQuestion}
                  disabled={loading || (!question.trim() && !selectedImage)}
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