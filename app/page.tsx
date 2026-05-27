"use client";

import { ClipboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

const EMPTY_STATE_PROMPTS = [
  "Create a new nurse onboarding checklist",
  "Troubleshoot a SigmaCare login issue",
  "Summarize the attendance policy",
  "Draft an email about a printer outage",
];

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
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

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

  function getSuggestionPrompts() {
    if (selectedImage) {
      return [
        "Explain this screenshot",
        "What issue do you see?",
        "Summarize this error",
        "What should I do next?",
      ];
    }

    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user")?.content
      .toLowerCase();

    if (lastUserMessage?.includes("printer")) {
      return [
        "Create a printer troubleshooting SOP",
        "Draft an incident report",
        "Escalate this to IT",
        "Make this into a checklist",
      ];
    }

    if (lastUserMessage?.includes("onboard")) {
      return [
        "Create onboarding checklist",
        "Draft welcome email",
        "List required systems",
        "Make this a training guide",
      ];
    }

    return EMPTY_STATE_PROMPTS;
  }

  return (
    <main className="h-screen overflow-hidden bg-[#f6f7f8] text-[#171717]">
      <div className="grid h-screen grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr]">
        <aside className="hidden h-screen overflow-y-auto border-r border-[#e5e7eb] bg-[#f8fafc] p-4 md:flex md:flex-col">
          <div className="mb-4 rounded-2xl border border-[#e5e7eb] bg-white p-3 shadow-sm">
            <img src={LOGO_URL} alt="St. Mary's Home" className="h-12 w-auto" />
          </div>

          <button
            onClick={newChat}
            className="mb-4 flex w-full items-center justify-between rounded-2xl bg-[#0f766e] px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59]"
          >
            <span>New chat</span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-base leading-none">
              +
            </span>
          </button>

          <nav className="space-y-1 text-sm">
            <button className="w-full rounded-xl bg-white px-3 py-2.5 text-left font-semibold text-[#111827] shadow-sm ring-1 ring-[#e5e7eb]">
              AI Knowledge Chat
            </button>

            <a
              href="/knowledge"
              className="block rounded-xl px-3 py-2.5 font-medium text-[#475569] transition hover:bg-white hover:text-[#111827] hover:shadow-sm"
            >
              Knowledge Library
            </a>
          </nav>

          <div className="mt-6 min-h-0">
            <div className="mb-2 px-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#94a3b8]">
                Recent chats
              </p>
            </div>

            <div className="max-h-80 space-y-0.5 overflow-y-auto pr-1 text-sm">
              {loadingChats && (
                <p className="px-2 py-2 text-xs text-[#94a3b8]">
                  Loading chats...
                </p>
              )}

              {!loadingChats && conversations.length === 0 && (
                <p className="px-2 py-2 text-xs leading-5 text-[#94a3b8]">
                  No saved chats yet.
                </p>
              )}

              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => loadConversation(conversation.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left transition ${
                    activeConversationId === conversation.id
                      ? "bg-[#e2e8f0] text-[#111827]"
                      : "text-[#64748b] hover:bg-[#edf2f7] hover:text-[#111827]"
                  }`}
                  title={conversation.title}
                >
                  <span className="line-clamp-1 text-[13px] font-medium leading-5">
                    {conversation.title || "New Chat"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto space-y-3 pt-4">
            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-3 text-xs leading-5 text-[#64748b] shadow-sm">
              <p className="font-semibold text-[#111827]">Document Sources</p>
              <p>
                Documents should be added through SharePoint and synced by
                authorized users.
              </p>
            </div>
          </div>
        </aside>

        <section className="flex h-screen min-h-0 flex-col bg-[#fbfbfa]">
          <header className="flex items-center justify-between border-b border-[#eeeeee] bg-white/95 px-4 py-3 backdrop-blur md:hidden">
            <img src={LOGO_URL} alt="St. Mary's Home" className="h-9 w-auto" />

            <div className="flex items-center gap-2">
              <button
                onClick={newChat}
                className="rounded-xl bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white"
              >
                New
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 sm:px-6 sm:py-8">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
              {messages.length <= 1 && (
                <div className="mx-auto mb-10 mt-4 w-full max-w-2xl text-center sm:mt-10">
                  <img
                    src={LOGO_URL}
                    alt="St. Mary's Home"
                    className="mx-auto mb-6 h-16 w-auto sm:h-20"
                  />

                  <h1 className="text-2xl font-semibold tracking-tight text-[#111827] sm:text-3xl">
                    St. Mary&apos;s AI Knowledge Assistant
                  </h1>

                  <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#5f6368]">
                    Ask questions across approved SharePoint documents, SOPs,
                    policies, onboarding materials, IT guides, operational
                    workflows, screenshots, and internal knowledge.
                  </p>

                  <div className="mt-7 grid gap-2 text-left sm:grid-cols-2">
                    {EMPTY_STATE_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setQuestion(prompt)}
                        className="rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm font-medium leading-5 text-[#374151] shadow-sm transition hover:border-[#cbd5e1] hover:bg-[#f8fafc]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-6 pb-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex w-full ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`group text-sm leading-7 shadow-sm ${
                        message.role === "user"
                          ? "max-w-[88%] rounded-2xl rounded-br-md bg-[#0f766e] px-4 py-3 text-white sm:max-w-[78%]"
                          : "w-full rounded-2xl border border-[#e5e7eb] bg-white px-4 py-4 text-[#171717] sm:px-5"
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
                        <div
                          className={`prose prose-sm max-w-none ${
                            message.role === "user"
                              ? "prose-invert"
                              : "prose-neutral"
                          }`}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      )}

                      {message.role === "assistant" && message.content && (
                        <div className="mt-3 flex flex-wrap gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
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
                        getStrongSources(message.sources).length > 0 && (
                          <div className="mt-4 rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-3">
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
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4 text-sm text-[#666] shadow-sm">
                      Thinking...
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>

          <div className="shrink-0 border-t border-[#eeeeee] bg-[#fbfbfa]/95 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
            <div className="mx-auto max-w-3xl">
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

              <div className="mb-3 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setSuggestionsOpen((value) => !value)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[#4b5563] hover:bg-[#f8fafc]"
                >
                  <span>Suggestions</span>
                  <span className={`text-xs transition-transform ${suggestionsOpen ? "rotate-180" : ""}`}>
                    ⌄
                  </span>
                </button>

                {suggestionsOpen && (
                  <div className="flex flex-wrap gap-2 border-t border-[#eeeeee] px-4 pb-4 pt-3">
                    {getSuggestionPrompts().map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          setQuestion(prompt);
                          setSuggestionsOpen(false);
                        }}
                        className="rounded-full border border-[#d9d9d9] bg-[#f8fafc] px-3 py-1.5 text-xs font-medium text-[#374151] transition hover:border-[#cbd5e1] hover:bg-white"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
                      : "Message St. Mary's AI..."
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
