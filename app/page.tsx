"use client";

import { ClipboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  WorkflowMetadata,
  WorkflowStep,
  WorkflowStepStatus,
} from "@/lib/workflow/types";

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

type SelectedAgent = {
  name: string;
  displayName: string;
  icon: string;
  reason?: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  escalation?: Escalation;
  trainingMode?: boolean;
  imageUrl?: string;
  imageName?: string;
  selectedAgent?: SelectedAgent;
  workflow?: WorkflowMetadata;
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
    "Hi, I’m St. Mary’s AI Workforce. I orchestrate specialized AI agents to help staff search approved knowledge, troubleshoot operational issues, draft documents, and support teams.",
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


function getStrongSources(sources?: Source[]) {
  if (!sources || sources.length === 0) return [];

  const sortedSources = [...sources]
    .filter((source) => Number(source.similarity || 0) >= 0.7)
    .sort((a, b) => Number(b.similarity || 0) - Number(a.similarity || 0));

  return sortedSources.slice(0, 4);
}

const ANSWER_LABEL_PREFIXES = [
  "General Knowledge",
  "Internal Source Summary",
  "Troubleshooting Guidance",
  "Generated Draft",
] as const;

type AnswerLabel = (typeof ANSWER_LABEL_PREFIXES)[number];

function extractAnswerLabel(content: string): { label: AnswerLabel | null; body: string } {
  for (const label of ANSWER_LABEL_PREFIXES) {
    const prefix = `## ${label}\n\n`;
    if (content.startsWith(prefix)) {
      return { label, body: content.slice(prefix.length) };
    }
  }
  return { label: null, body: content };
}

const LABEL_STYLES: Record<AnswerLabel, string> = {
  "General Knowledge": "bg-[#f1f5f9] text-[#64748b]",
  "Internal Source Summary": "bg-[#ecfdf5] text-[#065f46]",
  "Troubleshooting Guidance": "bg-[#eff6ff] text-[#1d4ed8]",
  "Generated Draft": "bg-[#faf5ff] text-[#6b21a8]",
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

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

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
          <title>St. Mary's AI Workforce Response</title>
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
            <h1>St. Mary's AI Workforce Response</h1>
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
            "Hi, I’m St. Mary’s AI Workforce. Which specialized agent should I route your work to today?",
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
            selectedAgent: data.success ? data.selectedAgent : undefined,
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

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          sources: [],
        },
      ]);

      const res = await fetch("/api/chat/stream", {
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

      if (!res.ok || !res.body) {
        throw new Error("Failed to start streaming response");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let assistantContent = "";
      let assistantSources: Source[] = [];
      let assistantEscalation: Escalation | null = null;
      let assistantTrainingMode = false;

      while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const line = event
            .split("\n")
            .find((eventLine) => eventLine.startsWith("data: "));

          if (!line) continue;

          const payload = JSON.parse(line.replace("data: ", ""));

          if (payload.type === "token") {
            assistantContent += payload.token || "";

            setMessages((prev) => {
              const updatedMessages = [...prev];
              const lastIndex = updatedMessages.length - 1;

              if (lastIndex >= 0 && updatedMessages[lastIndex].role === "assistant") {
                updatedMessages[lastIndex] = {
                  ...updatedMessages[lastIndex],
                  content: assistantContent,
                };
              }

              return updatedMessages;
            });
          }

          if (payload.type === "done") {
            assistantContent = payload.answer || assistantContent;
            assistantSources = payload.sources || [];
            assistantEscalation = payload.escalation || null;
            assistantTrainingMode = payload.trainingMode || false;

            setMessages((prev) => {
              const updatedMessages = [...prev];
              const lastIndex = updatedMessages.length - 1;

              if (lastIndex >= 0 && updatedMessages[lastIndex].role === "assistant") {
                updatedMessages[lastIndex] = {
                  ...updatedMessages[lastIndex],
                  content: assistantContent,
                  sources: assistantSources,
                  escalation: assistantEscalation || undefined,
                  trainingMode: assistantTrainingMode,
                  selectedAgent: payload.selectedAgent,
                  workflow: payload.workflow,
                };
              }

              return updatedMessages;
            });
          }

          if (payload.type === "error") {
            throw new Error(payload.error || "Streaming failed");
          }
        }
      }

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

  return (
    <main className="h-screen overflow-hidden bg-[#fbfbfa] text-[#171717]">
      <div className="flex h-screen overflow-hidden">
        <aside
          className={`hidden h-screen shrink-0 overflow-hidden border-r border-[#ececec] bg-[#f7f7f7] transition-[width] duration-300 ease-in-out md:flex md:flex-col ${
            sidebarCollapsed ? "w-[76px]" : "w-[244px]"
          }`}
        >
          <div className="flex h-14 items-center justify-between px-3">
            {sidebarCollapsed ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-semibold text-[#0f766e] shadow-sm">
               ⌂
              </div>
            ) : (
              <img src={LOGO_URL} alt="St. Mary's Home" className="h-9 w-auto" />
            )}

            <button
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-[#64748b] transition hover:bg-white hover:text-[#111827]"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? ">" : "<"}
            </button>
          </div>

          <button
            onClick={newChat}
            className={`mx-2 mt-1 flex h-10 items-center rounded-xl text-sm font-medium text-[#111827] transition hover:bg-white ${
              sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
            }`}
            title="New chat"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#d9d9d9] bg-white text-base leading-none">
              +
            </span>
            {!sidebarCollapsed && <span>New chat</span>}
          </button>

          <nav className="mt-2 space-y-0.5 px-2 text-sm">
            <button
              className={`flex h-10 w-full items-center rounded-xl bg-[#e8ecef] font-medium text-[#111827] ${
                sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3 text-left"
              }`}
              title="AI Workforce"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm">
                ◔
              </span>
              {!sidebarCollapsed && <span>AI Workforce</span>}
            </button>

            <a
              href="/knowledge"
              className={`flex h-10 items-center rounded-xl font-medium text-[#64748b] transition hover:bg-white hover:text-[#111827] ${
                sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
              }`}
              title="Knowledge Library"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm">
                □
              </span>
              {!sidebarCollapsed && <span>Knowledge Library</span>}
            </a>

            {sidebarCollapsed && (
              <>
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-center rounded-xl text-[#64748b] transition hover:bg-white hover:text-[#111827]"
                  title="Search chats"
                  aria-label="Search chats"
                >
                  ⌕
                </button>

                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-center rounded-xl text-[#64748b] transition hover:bg-white hover:text-[#111827]"
                  title="Recent chats"
                  aria-label="Recent chats"
                >
                  ☰
                </button>
              </>
            )}
          </nav>

          <div className={`mt-5 min-h-0 flex-1 ${sidebarCollapsed ? "px-2" : "px-2"}`}>
            {!sidebarCollapsed && (
              <div className="mb-1 px-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[#9ca3af]">
                  Recent
                </p>
              </div>
            )}

            <div className="h-full space-y-0.5 overflow-y-auto pr-1 text-sm">
              {loadingChats && (
                <p className="px-2 py-2 text-xs text-[#94a3b8]">
                  Loading chats...
                </p>
              )}

              {!sidebarCollapsed && !loadingChats && conversations.length === 0 && (
                <p className="px-2 py-2 text-xs leading-5 text-[#94a3b8]">
                  No saved chats yet.
                </p>
              )}

              {!sidebarCollapsed && conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => loadConversation(conversation.id)}
                  className={`flex h-9 w-full items-center rounded-lg text-left transition ${
                    activeConversationId === conversation.id
                      ? "bg-white text-[#111827] shadow-sm"
                      : "text-[#6b7280] hover:bg-white/80 hover:text-[#111827]"
                  } px-2.5`}
                  title={conversation.title}
                >
                  <span className="min-w-0 truncate text-[13px] font-normal leading-5">
                    {conversation.title || "New Chat"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {!sidebarCollapsed && (
            <div className="px-4 py-3">
              <p className="text-[11px] leading-5 text-[#8a8f98]">
                Documents are synced from SharePoint.
              </p>
            </div>
          )}
        </aside>

        <section className="flex h-screen min-w-0 flex-1 flex-col bg-[#fbfbfa]">
          <header className="flex items-center justify-between border-b border-[#eeeeee] bg-[#fbfbfa]/95 px-4 py-3 backdrop-blur md:hidden">
            <img src={LOGO_URL} alt="St. Mary's Home" className="h-8 w-auto" />

            <div className="flex items-center gap-2">
              <button
                onClick={newChat}
                className="rounded-lg bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white"
              >
                New
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 sm:px-6 sm:py-8">
            <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col">
              {messages.length <= 1 && (
                <div className="mx-auto mb-10 mt-4 w-full max-w-2xl text-center sm:mt-10">
                  <img
                    src={LOGO_URL}
                    alt="St. Mary's Home"
                    className="mx-auto mb-5 h-12 w-auto sm:h-14"
                  />

                  <h1 className="text-2xl font-semibold tracking-tight text-[#111827] sm:text-3xl">
                    St. Mary&apos;s AI Workforce
                  </h1>

                  <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#5f6368]">
                    An intelligent workforce of AI agents for St. Mary&apos;s staff — search organizational knowledge, complete operational tasks, troubleshoot issues, generate documents, and assist teams using approved information sources.
                  </p>
                </div>
              )}

              <div className="space-y-10 pb-6">
                {messages.map((message, index) => {
                  const { label: msgLabel, body: msgBody } =
                    message.role === "assistant" && message.content
                      ? extractAnswerLabel(message.content)
                      : { label: null as null, body: message.content ?? "" };
                  return (
                  <div
                    key={index}
                    className={
                      message.role === "user"
                        ? "flex justify-end"
                        : "flex items-start gap-5"
                    }
                  >
                    {message.role === "assistant" && (
                      <div className="mt-1 flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-[#e6f4f1] text-base">
                        🏥
                      </div>
                    )}
                    <div
                      className={`group ${
                        message.role === "user"
                          ? "max-w-[85%] rounded-2xl rounded-br-md bg-[#0f766e] px-4 py-3 text-sm leading-relaxed text-white shadow-sm sm:max-w-[70%]"
                          : "min-w-0 flex-1 text-[#171717]"
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
                        <div>
                          {msgLabel && !message.workflow && (
                            <div className={`mb-3 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${LABEL_STYLES[msgLabel]}`}>
                              {msgLabel}
                            </div>
                          )}
                          <div
                            className={
                              message.role === "user"
                                ? "prose prose-sm prose-invert max-w-none"
                                : "prose max-w-none text-[15.5px] leading-[1.85] text-[#1c1c1c] prose-headings:mb-4 prose-headings:mt-9 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-[#0f172a] prose-h1:text-[1.25rem] prose-h2:text-[1.1rem] prose-h3:text-[1rem] prose-p:my-[1.1rem] prose-p:leading-[1.85] prose-li:my-[0.55rem] prose-li:leading-[1.8] prose-ul:my-5 prose-ol:my-5 prose-ul:pl-5 prose-ol:pl-5 prose-pre:rounded-xl prose-pre:bg-[#f6f8fa] prose-pre:text-sm prose-code:rounded prose-code:bg-[#f1f5f9] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:text-[#c7254e] prose-strong:font-semibold prose-strong:text-[#0f172a] prose-blockquote:border-l-2 prose-blockquote:border-[#e2e8f0] prose-blockquote:pl-4 prose-blockquote:text-[#64748b] prose-blockquote:not-italic"
                            }
                          >
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.role === "assistant" ? msgBody : message.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}

                      {message.role === "assistant" && message.selectedAgent && (
                        <div className="mt-7 flex items-center gap-2 border-t border-[#f1f5f9] pt-3 text-[12px] text-[#94a3b8]">
                          <span className="text-sm leading-none opacity-60">
                            {message.selectedAgent.icon}
                          </span>
                          <span className="text-[#b0b8c4]">
                            {loading && index === messages.length - 1
                              ? "Working…"
                              : `Handled by ${message.selectedAgent.displayName}`}
                          </span>
                        </div>
                      )}

                      {message.role === "assistant" && message.workflow && (
                        <div className="mt-4 w-full max-w-xs border-l-2 border-[#e2e8f0] pl-4">
                          <div className="mb-2 flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-[#94a3b8]">
                              Workflow
                            </span>
                          </div>
                          <ol className="space-y-2">
                            {message.workflow.steps.map((step) => (
                              <li key={step.name} className="flex items-center gap-2 text-[12px]">
                                {step.icon === "check" && (
                                  <span className="shrink-0 text-[#22c55e]">{"✓"}</span>
                                )}
                                {step.icon === "warning" && (
                                  <span className="shrink-0 text-[#f59e0b]">{"⚠"}</span>
                                )}
                                {step.icon === "pending" && (
                                  <span className="shrink-0 text-[#cbd5e1]">{"·"}</span>
                                )}
                                <span
                                  className={
                                    step.status === "warning"
                                      ? "font-medium text-[#92400e]"
                                      : "text-[#374151]"
                                  }
                                >
                                  {step.label}
                                </span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {message.role === "assistant" && message.content && (
                        <div className="mt-5 flex flex-wrap gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          <button
                            onClick={() => copyMessage(message.content, index)}
                            className="rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-[#666] hover:border-[#d9d9d9] hover:bg-white hover:text-[#111]"
                          >
                            {copiedIndex === index ? "Copied" : "Copy"}
                          </button>

                          <button
                            onClick={() => printMessage(message)}
                            className="rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-[#666] hover:border-[#d9d9d9] hover:bg-white hover:text-[#111]"
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
                            className="rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-[#666] hover:border-[#d9d9d9] hover:bg-white hover:text-[#111]"
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
                            className="rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-[#666] hover:border-[#d9d9d9] hover:bg-white hover:text-[#111]"
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
                            className="rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-[#666] hover:border-[#d9d9d9] hover:bg-white hover:text-[#111]"
                          >
                            ⚠ Report Issue
                          </button>
                        </div>
                      )}

                      {message.role === "assistant" && message.trainingMode && (
                        <div className="mt-6 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4">
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
                          <div className="mt-6 rounded-2xl border border-[#e5e5e5] bg-white p-4">
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
                        getStrongSources(message.sources).length > 0 && (
                          <div className="mt-6 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                                Source Citations
                              </p>

                              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-[#64748b] ring-1 ring-[#e5e7eb]">
                                {getStrongSources(message.sources).length} shown
                              </span>
                            </div>

                            <div className="grid gap-2">
                              {getStrongSources(message.sources).map((source, sourceIndex) => (
                                <div
                                  key={source.id}
                                  className="rounded-xl border border-[#e5e7eb] bg-white p-3 text-xs shadow-sm"
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-start gap-2">
                                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e6f4f1] text-[10px] font-bold text-[#0f766e]">
                                          {sourceIndex + 1}
                                        </span>

                                        <div className="min-w-0">
                                          <p className="line-clamp-2 font-semibold leading-5 text-[#111827]">
                                            {source.title || source.sourceUrl || "Untitled source"}
                                          </p>

                                          <p className="mt-1 text-[#64748b]">
                                            {[source.category, source.source]
                                              .filter(Boolean)
                                              .join(" · ") || "Internal knowledge"}
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                                      <span className="rounded-full bg-[#f1f5f9] px-2 py-1 text-[10px] font-medium text-[#64748b]">
                                        Match{" "}
                                        {Math.round(
                                          Number(source.similarity || 0) * 100
                                        )}
                                        %
                                      </span>

                                      {source.sourceUrl && (
                                        <a
                                          href={source.sourceUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex rounded-full bg-[#0f766e] px-3 py-1 text-[10px] font-semibold text-white transition hover:bg-[#115e59]"
                                        >
                                          Open
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  {source.sourceUrl && (
                                    <p className="mt-2 truncate pl-7 text-[10px] text-[#94a3b8]">
                                      {source.sourceUrl}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                  );
                })}

                {loading && (
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-[#e6f4f1] text-base">
                      🏥
                    </div>
                    <div className="py-2 text-sm text-[#64748b]">
                      Thinking…
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-[#eeeeee] bg-[#fbfbfa]/95 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
            <div className="mx-auto max-w-4xl">
              {imagePreviewUrl && (
                <div className="mb-3 rounded-2xl border border-[#d9d9d9] bg-white p-3 shadow-sm">
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

              <div className="flex items-end gap-2 rounded-3xl border border-[#d1d5db] bg-white px-3 py-3 shadow-lg shadow-black/5 focus-within:border-[#94a3b8] sm:gap-3 sm:px-4">
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
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d9d9d9] bg-white text-lg font-semibold leading-none hover:bg-[#f7f7f8] disabled:opacity-50"
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
                      : "Message St. Mary's AI Workforce..."
                  }
                  rows={1}
                  className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm leading-6 outline-none placeholder:text-[#9ca3af]"
                />

                <button
                  onClick={askQuestion}
                  disabled={loading || (!question.trim() && !selectedImage)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0f766e] text-lg font-semibold leading-none text-white transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send message"
                  title="Send"
                >
                  ↑
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
