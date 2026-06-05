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
  sourceUrl: string | null;
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
  phiWarning?: { detected: boolean; redactedCount: number };
  isSchedule?: boolean;
  scheduleMode?: "daily" | "weekly" | "report";
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

const LOGO_URL =
  "https://saintmaryshome.org/wp-content/uploads/2025/05/SMH-Logo-2025_LinearStackedTagline-Color.svg";

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

function getEscalationContact(escalation?: Escalation) {
  const team = escalation?.team?.toLowerCase() || "";

  if (
    team.includes("it") ||
    team.includes("technology") ||
    team.includes("support") ||
    team.includes("outlook") ||
    team.includes("printer")
  ) {
    return {
      label: "IT Support",
      email: "infotechsupport@smhdc.org",
    };
  }

  return {
    label: escalation?.team || "Supervisor / Leadership",
    email: "",
  };
}

function buildEscalationDraft(message: Message, previousUserPrompt?: string) {
  if (!message.escalation?.shouldEscalate) return null;

  const contact = getEscalationContact(message.escalation);
  const team = message.escalation.team || "Supervisor / Leadership";
  const urgency = urgencyLabel(message.escalation.urgency);
  const requestSummary = previousUserPrompt || "No original request was captured.";
    const subject = `${team} prompt: review recommended next step`;
  const body = [
    `Hello ${contact.label},`,
    "",
    "Could you please review the prompt below and advise on the appropriate next step?",
    "",
    `Prompt: ${requestSummary}`,
    "",
    "Details:",
    `• Recommended team: ${team}`,
    `• Urgency: ${urgency}`,
    message.escalation.recommendedNextStep
      ? `• Suggested next step: ${message.escalation.recommendedNextStep}`
      : null,
    "",
    "Please let me know how you would like this handled.",
  ].filter((line): line is string => line !== null).join("\n");
    const teamsBody = [
      `Can someone from ${team} review this prompt?`,
      "",
      "Prompt",
      requestSummary,
    "",
    `Urgency: ${urgency}`,
    message.escalation.recommendedNextStep
      ? `Suggested next step: ${message.escalation.recommendedNextStep}`
      : null,
  ].filter((line): line is string => line !== null).join("\n");

  return {
    contact,
    subject,
    body,
    teamsBody,
    mailto: `mailto:${encodeURIComponent(contact.email)}?subject=${encodeURIComponent(subject)}&body=${encodeMailtoBody(body)}`,
    teamKey: contact.email === "infotechsupport@smhdc.org" ? "it_support" : "",
  };
}

async function openTeamsEscalationDraft(draft: NonNullable<ReturnType<typeof buildEscalationDraft>>) {
  let recipients: string[] = [];

  if (draft.teamKey) {
    const res = await fetch(
      `/api/escalation/teams-recipients?team=${encodeURIComponent(draft.teamKey)}`
    );
    const data = (await res.json().catch(() => null)) as
      | { recipients?: unknown }
      | null;

    if (Array.isArray(data?.recipients)) {
      recipients = data.recipients.filter(
        (recipient): recipient is string =>
          typeof recipient === "string" && recipient.includes("@")
      );
    }
  }

  if (recipients.length === 0 && draft.contact.email.includes("@")) {
    recipients = [draft.contact.email];
  }

  if (recipients.length === 0) return;

  const encodedUsers = recipients.map((recipient) => encodeURIComponent(recipient)).join(",");
  const teamsUrl = `msteams://teams.microsoft.com/l/chat/0/0?users=${encodedUsers}&topicName=${encodeURIComponent("AI Workforce Escalation")}&message=${encodeURIComponent(draft.teamsBody)}`;
  window.open(teamsUrl, "_blank", "noopener,noreferrer");
}


function getVisibleSources(sources?: Source[]) {
  if (!sources || sources.length === 0) return [];

  const uniqueSources = new Map<string, Source>();

  for (const source of sources) {
    const key = source.documentId || source.id || source.title;
    const existing = uniqueSources.get(key);

    if (
      !existing ||
      Number(source.similarity || 0) > Number(existing.similarity || 0)
    ) {
      uniqueSources.set(key, source);
    }
  }

  const rankedSources = [...uniqueSources.values()]
    .sort((a, b) => Number(b.similarity || 0) - Number(a.similarity || 0));
  const strongSources = rankedSources.filter(
    (source) => Number(source.similarity || 0) >= 0.4
  );

  return (strongSources.length > 0 ? strongSources : rankedSources).slice(0, 8);
}

function getSourceOpenUrl(source: Source) {
  if (source.sourceUrl) return source.sourceUrl;

  return null;
}

function getSourceLocationLabel(source: Source) {
  if (source.sourceUrl) return source.sourceUrl;
  return "SharePoint link unavailable";
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

function normalizeAssistantMarkdown(content: string) {
  const sectionLabels = new Set([
    "Purpose",
    "Retention Period",
    "Records Covered",
    "Specific Records",
    "Additional Records",
    "Source Note",
    "Next Step",
    "Steps",
    "Quick Checks",
    "Likely Causes",
    "Escalation",
  ]);
  const sectionPattern = [...sectionLabels].join("|");
  return content
    .trim()
    .replace(/^\s*\*\*\s*$/gm, "")
    .replace(/^\s*\*\*\s+/gm, "")
    .replace(/\s+\*\*\s*$/gm, "")
    .replace(
      new RegExp(`\\n?(${sectionPattern})\\s*:\\s*`, "g"),
      "\n\n### $1\n\n"
    )
    .replace(
      /\n([A-Z][A-Za-z\s-]{4,60}(?:Overview|Summary|Policy|Procedure|Guidance))\n/g,
      "\n\n### $1\n\n"
    )
    .replace(/\n(?=###\s)/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n");
}


function cleanEmailDraftLine(value: string) {
  return value
    .replace(/\*+/g, "")
    .replace(/\[optional\]/gi, "")
    .replace(/\bnone\b/gi, "")
    .trim();
}

function extractEmailAddresses(value: string) {
  const cleaned = cleanEmailDraftLine(value);
  const matches = cleaned.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return matches || [];
}

function getEmailField(body: string, field: "To" | "CC" | "BCC" | "Subject") {
  const match = body.match(new RegExp(`^\\s*[-*]?\\s*\\*{0,2}${field}\\*{0,2}:\\s*(.+)$`, "im"));
  return match ? cleanEmailDraftLine(match[1]) : "";
}

function extractEmailDraft(body: string): {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  emailBody: string;
} | null {
  // Look for Subject: line anywhere in the draft
  const subjectMatch = body.match(/^\s*[-*]?\s*\*{0,2}Subject\*{0,2}:\s*(.+)$/im);
  if (!subjectMatch) return null;

  const subject = cleanEmailDraftLine(subjectMatch[1]);
  const to = extractEmailAddresses(getEmailField(body, "To"));
  const cc = extractEmailAddresses(getEmailField(body, "CC"));
  const bcc = extractEmailAddresses(getEmailField(body, "BCC"));

  const bodyMatch = body.match(/^\s*[-*]?\s*\*{0,2}Body\*{0,2}:\s*$/im);
  const bodyStart = bodyMatch
    ? body.indexOf(bodyMatch[0]) + bodyMatch[0].length
    : body.indexOf(subjectMatch[0]) + subjectMatch[0].length;
  const afterSubject = body.slice(bodyStart);

  // Strip markdown syntax for the mailto body
  const emailBody = afterSubject
    .replace(/^\n+/, "")
    .replace(/#{1,3}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^-\s+/gm, "• ")
    .trim();

  return { to, cc, bcc, subject, emailBody };
}

function encodeMailtoBody(value: string) {
  return encodeURIComponent(value.replace(/\r?\n/g, "\r\n"));
}

function OutlookButton({ body }: { body: string }) {
  const draft = extractEmailDraft(body);
  if (!draft) return null;

  const params = [
    draft.cc.length > 0 ? `cc=${encodeURIComponent(draft.cc.join(","))}` : null,
    draft.bcc.length > 0 ? `bcc=${encodeURIComponent(draft.bcc.join(","))}` : null,
    `subject=${encodeURIComponent(draft.subject)}`,
    `body=${encodeMailtoBody(draft.emailBody)}`,
  ].filter(Boolean);

  const mailto = `mailto:${encodeURIComponent(draft.to.join(","))}?${params.join("&")}`;

  return (
    <a
      href={mailto}
      className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-semibold text-[#0f172a] shadow-sm transition hover:border-[#0f766e] hover:text-[#0f766e]"
    >
      <span>📧</span>
      Send email (draft)
    </a>
  );
}

const LABEL_STYLES: Record<AnswerLabel, string> = {
  "General Knowledge": "bg-[#f1f5f9] text-[#64748b]",
  "Internal Source Summary": "bg-[#ecfdf5] text-[#065f46]",
  "Troubleshooting Guidance": "bg-[#eff6ff] text-[#1d4ed8]",
  "Generated Draft": "bg-[#faf5ff] text-[#6b21a8]",
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );

  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; role: string } | null>(null);
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => d && setCurrentUser(d.user));
  }, []);

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

  function toggleVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in this browser. Please use Chrome.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    recognitionRef.current = rec;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setQuestion(transcript);
      if (e.results[e.results.length - 1].isFinal) {
        setListening(false);
      }
    };
    rec.start();
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
      setMessages([]);
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

      setMessages(loadedMessages);
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

  async function deleteConversation(conversationId: string) {
    if (!confirm("Delete this chat?")) return;

    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete chat");
      }

      setConversations((prev) =>
        prev.filter((conversation) => conversation.id !== conversationId)
      );

      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (error: any) {
      alert(error.message || "Failed to delete chat");
    }
  }

  async function askQuestion(overrideQuestion?: string) {
    const effectiveQuestion = overrideQuestion ?? question;
    if ((!effectiveQuestion.trim() && !selectedImage) || loading) return;
    if (overrideQuestion) setQuestion(overrideQuestion);

    let conversationId = activeConversationId;

    try {
      if (!conversationId) {
        const conversation = await createConversation(
          effectiveQuestion.trim() ? effectiveQuestion.slice(0, 60) : "Image conversation"
        );
        conversationId = conversation.id;
        setActiveConversationId(conversation.id);
      }

      const currentQuestion = (overrideQuestion ?? question).trim();
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

          if (payload.type === "agent_status") {
            continue;
          }

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
                  phiWarning: payload.phiWarning || undefined,
                  isSchedule: payload.isSchedule || false,
                  scheduleMode: payload.scheduleMode || undefined,
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

  const isEmptyChat = messages.length === 0 && !loading;

  function renderComposer(variant: "center" | "bottom") {
    const isCenter = variant === "center";

    return (
      <div className={isCenter ? "mx-auto w-full max-w-3xl" : "mx-auto max-w-4xl"}>
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

        <div
          className={`flex items-end gap-2 rounded-3xl border border-[#d1d5db] bg-white px-3 py-3 focus-within:border-[#94a3b8] sm:gap-3 sm:px-4 ${
            isCenter
              ? "shadow-2xl shadow-black/10"
              : "shadow-lg shadow-black/5"
          }`}
        >
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleImageSelect(e.target.files?.[0] || null)}
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
            onClick={toggleVoice}
            disabled={loading}
            title={listening ? "Stop recording" : "Voice input"}
            aria-label="Voice input"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-50 ${
              listening
                ? "animate-pulse border-red-300 bg-red-50 text-red-500"
                : "border-[#d9d9d9] bg-white text-[#6b7280] hover:bg-[#f7f7f8]"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 17.93V21H9v2h6v-2h-2v-2.07A8.001 8.001 0 0 0 20 11h-2a6 6 0 0 1-12 0H4a8.001 8.001 0 0 0 7 6.93z"/>
            </svg>
          </button>

          <button
            onClick={() => askQuestion()}
            disabled={loading || (!question.trim() && !selectedImage)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0f766e] text-lg font-semibold leading-none text-white transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
            title="Send"
          >
            ↑
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-[#888]">
          Answers should be verified against source documents before operational use.
        </p>
        <p className="mt-1 text-center text-xs text-[#b0b8c4]">
          Security concern or PHI exposure?{" "}
          <a
            href="mailto:infotechsupport@smhdc.org"
            className="underline underline-offset-2 hover:text-[#6b7280]"
          >
            Report to IT / Compliance
          </a>
        </p>
      </div>
    );
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
            <a
              href="/"
              className={`flex h-11 min-w-0 items-center rounded-xl font-semibold text-[#111827] transition hover:bg-white ${
                sidebarCollapsed ? "w-11 justify-center" : "gap-2 px-2"
              }`}
              title="St. Mary's Home AI Workforce"
            >
              {sidebarCollapsed ? (
                <img src={LOGO_URL} alt="St. Mary's Home" className="h-7 w-auto max-w-9 object-contain" />
              ) : (
                <>
                  <img src={LOGO_URL} alt="St. Mary's Home" className="h-8 w-auto max-w-[120px] shrink-0 object-contain" />
                  <span className="shrink-0 text-[13px] font-semibold leading-tight text-[#111827]">
                    AI Workforce
                  </span>
                </>
              )}
            </a>
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

          <nav className="mt-2 space-y-0.5 px-2 text-sm">
            <button
              onClick={newChat}
              className={`flex h-10 w-full items-center rounded-xl font-medium text-[#111827] transition hover:bg-white ${
                sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3 text-left"
              }`}
              title="New chat"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm">
                ✎
              </span>
              {!sidebarCollapsed && <span>New chat</span>}
            </button>

            <a
              href="/conversations"
              className={`flex h-10 items-center rounded-xl font-medium text-[#111827] transition hover:bg-white ${
                sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
              }`}
              title="Chat history"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm">
                ☰
              </span>
              {!sidebarCollapsed && <span>Chat history</span>}
            </a>

            <a
              href="/knowledge"
              className={`flex h-10 items-center rounded-xl font-medium text-[#111827] transition hover:bg-white ${
                sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
              }`}
              title="Knowledge Library"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm">
                ▣
              </span>
              {!sidebarCollapsed && <span>Knowledge Library</span>}
            </a>

            {(currentUser?.role === "admin" || currentUser?.role === "it_staff") && (
              <a
                href="/admin/agents"
                className={`flex h-10 items-center rounded-xl font-medium text-[#111827] transition hover:bg-white ${
                  sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                }`}
                title="Command Center"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm">
                  ✦
                </span>
                {!sidebarCollapsed && <span>Command Center</span>}
              </a>
            )}

            {currentUser?.role === "admin" && (
              <a
                href="/admin/dashboard"
                className={`flex h-10 items-center rounded-xl font-medium text-[#111827] transition hover:bg-white ${
                  sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"
                }`}
                title="Admin Dashboard"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm">
                  ⚙
                </span>
                {!sidebarCollapsed && <span>Admin Dashboard</span>}
              </a>
            )}

          </nav>

          <div className={`mt-6 min-h-0 flex-1 ${sidebarCollapsed ? "px-2" : "px-2"}`}>
            {sidebarCollapsed ? (
              <div className="space-y-0.5">
                <a
                  href="/conversations"
                  className="flex h-10 w-full items-center justify-center rounded-xl text-[#64748b] transition hover:bg-white hover:text-[#111827]"
                  title="Recent chats"
                  aria-label="Recent chats"
                >
                  ☰
                </a>
              </div>
            ) : (
              <div className="mb-1 flex items-center justify-between px-2">
                <p className="text-[13px] font-semibold text-[#111827]">
                  Recents
                </p>
                {conversations.length > 0 && (
                  <button
                    onClick={async () => {
                      if (!confirm("Clear all conversations?")) return;
                      await fetch("/api/conversations/clear", { method: "DELETE" });
                      setConversations([]);
                      setActiveConversationId(null);
                      setMessages([]);
                    }}
                    className="text-[10px] font-medium text-[#9ca3af] hover:text-red-500 transition"
                    title="Clear all conversations"
                  >
                    Clear all
                  </button>
                )}
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
                <div
                  key={conversation.id}
                  className={`group flex h-9 w-full items-center rounded-lg transition ${
                    activeConversationId === conversation.id
                      ? "bg-white text-[#111827] shadow-sm"
                      : "text-[#111827] hover:bg-white/80"
                  }`}
                >
                  <button
                    onClick={() => loadConversation(conversation.id)}
                    className="min-w-0 flex-1 px-2.5 text-left"
                    title={conversation.title}
                  >
                    <span className="block min-w-0 truncate text-[13px] font-normal leading-5">
                      {conversation.title || "New Chat"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteConversation(conversation.id);
                    }}
                    className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#9ca3af] opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
                    title="Delete chat"
                    aria-label={`Delete ${conversation.title || "chat"}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {!sidebarCollapsed && (
            <div className="border-t border-[#ececec] px-3 py-3">
              <div className="flex items-center gap-2 rounded-xl px-2 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0f766e] text-[11px] font-bold text-white">
                  {currentUser?.name
                    ? currentUser.name.trim().split(/\s+/).map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
                    : "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[#111827] leading-tight">
                    {currentUser?.name ?? "Staff"}
                  </p>
                  <p className="truncate text-[11px] text-[#9ca3af]">
                    {currentUser?.email ?? (currentUser?.role === "admin" ? "Admin" : currentUser?.role === "it_staff" ? "IT Staff" : "Staff")}
                  </p>
                </div>
                <a
                  href="/settings"
                  title="Account settings"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] transition hover:bg-[#f1f5f9] hover:text-[#374151]"
                >
                  ⚙
                </a>
                <button
                  onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
                  title="Sign out"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] transition hover:bg-[#f1f5f9] hover:text-[#374151]"
                >
                  ↪
                </button>
              </div>
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
              {isEmptyChat && (
                <div className="mx-auto flex min-h-[80vh] w-full max-w-3xl flex-col items-center justify-center px-4 pb-20 pt-4 text-center">
                  <img
                    src={LOGO_URL}
                    alt="St. Mary's Home"
                    className="mx-auto mb-4 h-12 w-auto sm:h-14"
                  />

                  <h1 className="text-2xl font-semibold tracking-tight text-[#111827] sm:text-3xl">
                    St. Mary&apos;s AI Workforce
                  </h1>

                  <h2 className="mt-5 text-xl font-medium text-[#374151] sm:text-2xl">
                    What can I help with{currentUser?.name ? `, ${currentUser.name.trim().split(/\s+/)[0]}` : ""}?
                  </h2>

                  <div className="mt-4 w-full">
                    {renderComposer("center")}
                  </div>

                  {/* Action chips */}
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <button
                      onClick={() => askQuestion("Create my daily schedule")}
                      className="flex items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#0f766e] hover:bg-[#f9fffe]"
                    >
                      <span className="text-lg">📅</span>
                      <div>
                        <p className="text-[13px] font-semibold text-[#111827]">Create my daily schedule</p>
                        <p className="mt-0.5 text-[12px] text-[#9ca3af]">Calendar, emails &amp; tasks</p>
                      </div>
                    </button>

                  </div>

                  {/* Medical knowledge tip */}
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#d1fae5] bg-[#f0fdf4] px-4 py-3 text-left max-w-lg">
                    <span className="mt-0.5 text-base shrink-0">⚕️</span>
                    <p className="text-[13px] leading-relaxed text-[#166534]">
                      <span className="font-semibold">Medical questions welcome.</span>{" "}Ask about medications, conditions, infection control, or clinical procedures — backed by FDA, NIH, MedlinePlus &amp; CDC. Don&apos;t include resident names or PHI.
                    </p>
                  </div>
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

                      {message.role === "assistant" && message.phiWarning?.detected && (
                        <div className="mb-3 flex items-start gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5 text-[12px] leading-5 text-[#92400e]">
                          <span className="mt-0.5 shrink-0">⚠️</span>
                          <span>
                            Sensitive information was detected and removed from your message before processing. Do not enter resident, patient, or employee information into this assistant.
                          </span>
                        </div>
                      )}

                      {message.role === "assistant" && message.isSchedule && (
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                          <span className="text-[12px] font-medium text-[#6b7280]">
                          {message.scheduleMode === "report" ? "Your weekly accomplishment report is ready." : `Your ${message.scheduleMode ?? "daily"} schedule is ready.`}
                        </span>
                          <button
                            onClick={() => {
                              const w = window.open("", "_blank");
                              if (!w) return;
                              w.document.write("<html><head><title>Schedule</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;line-height:1.7}h1,h2,h3{color:#0f766e}ul{padding-left:20px}</style></head><body>");
                              w.document.write("<h1>📅 " + (message.scheduleMode === "weekly" ? "Weekly" : "Daily") + " Schedule</h1>");
                              w.document.write("<pre style='white-space:pre-wrap;font-family:inherit'>" + (message.content ?? "").replace(/</g,"&lt;") + "</pre>");
                              w.document.write("</body></html>");
                              w.document.close();
                              w.print();
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-medium text-[#374151] shadow-sm hover:border-[#0f766e] hover:text-[#0f766e]"
                          >
                            🖨️ Print
                          </button>
                          <button
                            onClick={async () => {
                              if (message.scheduleMode === "report") {
                                const res = await fetch("/api/reports/weekly?email=true");
                                const data = await res.json();
                                if (data.success) alert("Report emailed to your Outlook inbox!");
                                else alert("Could not send email: " + (data.error ?? "unknown error"));
                              } else {
                                const res = await fetch("/api/schedule/email", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ schedule: message.content, mode: message.scheduleMode }),
                                });
                                const data = await res.json();
                                if (data.success) alert("Schedule emailed to your Outlook inbox!");
                                else alert("Could not send email: " + (data.error ?? "unknown error"));
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-medium text-[#374151] shadow-sm hover:border-[#0f766e] hover:text-[#0f766e]"
                          >
                            📧 Email to me
                          </button>
                          {message.scheduleMode !== "weekly" && (
                            <button
                              onClick={() => { setQuestion("Create my weekly schedule"); askQuestion("Create my weekly schedule"); }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d1fae5] bg-[#f0fdf4] px-3 py-1.5 text-[12px] font-medium text-[#0f766e] shadow-sm hover:bg-[#dcfce7]"
                            >
                              📆 Get weekly schedule
                            </button>
                          )}
                        </div>
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
                                : "assistant-answer prose max-w-none rounded-2xl border border-[#e5e7eb] bg-white px-6 py-6 text-[15px] leading-7 text-[#1f2937] shadow-sm prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-[#0f766e] prose-headings:mt-8 prose-headings:mb-2 prose-h1:text-[1.4rem] prose-h2:text-[1.25rem] prose-h3:text-[1.1rem] prose-p:my-3 prose-p:leading-7 prose-li:my-1.5 prose-li:leading-7 prose-ul:my-3 prose-ol:my-3 prose-ul:pl-6 prose-ol:pl-6 prose-li:marker:text-[#0f766e] prose-hr:my-6 prose-hr:border-[#e5e7eb] prose-a:font-medium prose-a:text-[#0f766e] prose-a:underline prose-a:underline-offset-2 prose-pre:rounded-xl prose-pre:bg-[#f6f8fa] prose-pre:text-sm prose-code:rounded prose-code:bg-[#f1f5f9] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:text-[#c7254e] prose-strong:font-semibold prose-strong:text-[#0f172a] prose-blockquote:my-5 prose-blockquote:rounded-xl prose-blockquote:border-l-4 prose-blockquote:border-[#99f6e4] prose-blockquote:bg-[#f0fdfa] prose-blockquote:px-4 prose-blockquote:py-3 prose-blockquote:text-[#334155] prose-blockquote:not-italic"
                            }
                          >
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {message.role === "assistant"
                                ? normalizeAssistantMarkdown(msgBody)
                                : message.content}
                            </ReactMarkdown>
                          </div>
                          {msgLabel === "Generated Draft" && (
                            <OutlookButton body={msgBody} />
                          )}
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
                        getVisibleSources(message.sources).length > 0 && (
                          <div className="mt-4 rounded-xl border border-[#e5e7eb] bg-[#f8fafc]/80 p-3">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                                Source Citations
                              </p>

                              <span className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-[#64748b] ring-1 ring-[#e5e7eb]">
                                {getVisibleSources(message.sources).length} shown
                              </span>
                            </div>

                            <div className="grid max-h-[174px] gap-2 overflow-y-auto pr-1">
                              {getVisibleSources(message.sources).map((source, sourceIndex) => {
                                const openUrl = getSourceOpenUrl(source);

                                return (
                                <div
                                  key={source.id}
                                  className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-xs shadow-sm transition hover:border-[#cbd5e1]"
                                >
                                  <div className="flex items-center justify-between gap-3">
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
                                      {Number(source.similarity || 0) > 0 && (
                                        <span className="rounded-full bg-[#f1f5f9] px-2 py-1 text-[10px] font-medium text-[#64748b]">
                                        Match{" "}
                                        {Math.round(
                                          Number(source.similarity || 0) * 100
                                        )}
                                        %
                                        </span>
                                      )}

                                      {openUrl && (
                                        <a
                                          href={openUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex rounded-full bg-[#0f766e] px-3 py-1 text-[10px] font-semibold text-white transition hover:bg-[#115e59]"
                                        >
                                          Open
                                        </a>
                                      )}
                                      {!openUrl && (
                                        <span className="inline-flex rounded-full bg-[#f1f5f9] px-3 py-1 text-[10px] font-semibold text-[#94a3b8]">
                                          No link
                                        </span>
                                      )}
                                    </div>
                                  </div>


                                </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                      {message.role === "assistant" &&
                        message.escalation?.shouldEscalate && (() => {
                          const escalationDraft = buildEscalationDraft(
                            message,
                            messages[index - 1]?.role === "user"
                              ? messages[index - 1]?.content
                              : undefined
                          );

                          return (
                          <div className="mt-4 rounded-xl border border-[#e5e7eb] bg-white px-3 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">
                                    Recommended Support Escalation
                                  </span>

                                  <span
                                    className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${urgencyClass(
                                      message.escalation.urgency
                                    )}`}
                                  >
                                    {urgencyLabel(message.escalation.urgency)}
                                  </span>
                                </div>

                                <p className="mt-1 text-xs leading-5 text-[#334155]">
                                  <span className="font-semibold text-[#0f172a]">
                                    {message.escalation.team || "Supervisor / Leadership"}:
                                  </span>{" "}
                                  {message.escalation.recommendedNextStep ||
                                    "Review and advise on the appropriate next step."}
                                </p>

                                <p className="mt-1 text-[10px] leading-4 text-[#94a3b8]">
                                  Support contact actions open as drafts only. Review before sending. No PHI, resident details, or confidential employee information.
                                </p>
                              </div>

                            {escalationDraft && (
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <a
                                  href={escalationDraft.mailto}
                                  className="inline-flex rounded-full border border-[#0f766e]/20 bg-[#ecfdf5] px-3 py-2 text-xs font-semibold text-[#0f766e] transition hover:border-[#0f766e] hover:bg-[#d1fae5]"
                                >
                                  Send support email
                                </a>

                                {escalationDraft.contact.email ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void openTeamsEscalationDraft(escalationDraft);
                                    }}
                                    className="inline-flex rounded-full border border-[#2563eb]/20 bg-[#eff6ff] px-3 py-2 text-xs font-semibold text-[#1d4ed8] transition hover:border-[#2563eb] hover:bg-[#dbeafe]"
                                  >
                                    Send support Teams chat
                                  </button>
                                ) : (
                                  <span className="inline-flex rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-3 py-2 text-xs font-semibold text-[#94a3b8]">
                                    Teams recipient needed
                                  </span>
                                )}
                              </div>
                            )}
                            </div>
                          </div>
                          );
                        })()}
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

          {!isEmptyChat && (
            <div className="shrink-0 border-t border-[#eeeeee] bg-[#fbfbfa]/95 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
              {renderComposer("bottom")}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
