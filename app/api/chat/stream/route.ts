import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { AgentRouter } from "@/lib/agents/AgentRouter";
import { db } from "@/lib/db";
import { deIdentifyText } from "@/lib/phi/deidentify";
import { checkRateLimit, rateLimitKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 300;

type StoredMessage = { role: "user" | "assistant"; content: string };

const AGENT_DISPLAY: Record<string, { displayName: string; icon: string }> = {
  internal_knowledge:    { displayName: "Knowledge Agent",          icon: "🔍" },
  policy:                { displayName: "Policy Agent",             icon: "📋" },
  it_support:            { displayName: "IT Support Agent",         icon: "🖥" },
  document_assistant:    { displayName: "HR Agent",                 icon: "👥" },
  medical_education:     { displayName: "Medical Education Agent",  icon: "🏥" },
  executive:             { displayName: "Executive Agent",          icon: "📊" },
  compliance_survey:     { displayName: "Compliance Agent",        icon: "✅" },
  payroll_benefits:      { displayName: "Payroll & Benefits Agent", icon: "💰" },
  staffing:              { displayName: "Staffing Agent",           icon: "🗓" },
  training_education:    { displayName: "Training Agent",           icon: "🎓" },
  facilities:            { displayName: "Facilities Agent",         icon: "🔧" },
  family_communications: { displayName: "Family Comms Agent",       icon: "💌" },
  quality_assurance:     { displayName: "QA Agent",                 icon: "📈" },
  vendor_supply:         { displayName: "Vendor & Supply Agent",    icon: "📦" },
};

function getAgentMeta(name: string) {
  return AGENT_DISPLAY[name] ?? { displayName: "Knowledge Agent", icon: "🔍" };
}

function sendEvent(controller: ReadableStreamDefaultController, data: unknown) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
}

function streamText(controller: ReadableStreamDefaultController, text: string) {
  const CHUNK = 180;
  for (let i = 0; i < text.length; i += CHUNK) {
    sendEvent(controller, { type: "token", token: text.slice(i, i + CHUNK) });
  }
}

function sendStatus(
  controller: ReadableStreamDefaultController,
  opts: {
    agent?: { name: string; displayName: string; icon: string; reason?: string };
    status: "routing" | "agent_selected" | "searching_sources" | "checking_safety" | "drafting" | "ready" | "error";
    label: string;
    sourceCount?: number;
    toolName?: string;
    workflowId?: string;
  }
) {
  sendEvent(controller, { type: "agent_status", ...opts });
}

function isMetaQuestion(q: string) {
  const l = q.toLowerCase().trim();
  return (
    l.includes("what agents") || l.includes("which agents") ||
    l.includes("what can you do") || l.includes("what do you do") ||
    l.includes("what are you") || l.includes("who are you") ||
    l.includes("what tools do you") ||
    (l.includes("agents") && (l.includes("available") || l.includes("have") || l.includes("got"))) ||
    l === "help" || l === "capabilities" || l.includes("your capabilities") ||
    l.includes("what workforce")
  );
}

function isScheduleRequest(q: string) {
  const l = q.toLowerCase().trim();
  return (
    l.includes("daily schedule") || l.includes("create my schedule") ||
    l.includes("my schedule") || l.includes("weekly schedule") ||
    l.includes("schedule for today") || l.includes("plan my day") ||
    l.includes("plan my week") || l.includes("what do i have today") ||
    l.includes("what's on my calendar") || l.includes("whats on my calendar")
  );
}

function isWeeklyScheduleRequest(q: string) {
  const l = q.toLowerCase().trim();
  return l.includes("weekly") && (l.includes("schedule") || l.includes("plan") || l.includes("week"));
}

function getMetaAnswer() {
  return `St. Mary's AI Workforce has **14 specialized agents**:

- 🔍 **Knowledge Agent** — general internal document lookup and fallback for any question.
- 📋 **Policy Agent** — policies, SOPs, procedures, handbooks, and operational guidelines.
- 🖥 **IT Support Agent** — printers, passwords, Outlook, Teams, SharePoint, CareTracker, SigmaCare, hardware, and Issuetrak tickets.
- 👥 **HR Agent** — onboarding checklists, orientation materials, email drafts, templates, and documentation.
- 🏥 **Medical Education Agent** — general health education. Does not provide diagnosis, treatment, or resident-specific advice.
- 📊 **Executive Agent** — leadership summaries, operational briefings, risk overviews, and recommendations.
- ✅ **Compliance Agent** — CMS surveys, deficiency citations, F-tags, plans of correction, and regulatory readiness.
- 💰 **Payroll & Benefits Agent** — Paylocity, paycheck questions, PTO, benefits, open enrollment, and timecard issues.
- 🗓 **Staffing Agent** — scheduling, shift coverage, call-outs, overtime, per diem, and minimum staffing.
- 🎓 **Training Agent** — in-service training, mandatory modules, competency checks, and certifications.
- 🔧 **Facilities Agent** — maintenance requests, HVAC, plumbing, electrical, and building issues.
- 💌 **Family Comms Agent** — family letters, admission/discharge notices, family updates, and communications.
- 📈 **QA Agent** — incident reports, fall investigations, QAPI, grievances, and adverse events.
- 📦 **Vendor & Supply Agent** — supply orders, PPE, vendor contacts, and procurement.

**Example requests**

- "Summarize the attendance policy"
- "Troubleshoot a SigmaCare login issue"
- "Submit an IT ticket for a broken printer in Area 2"
- "Draft a new nurse onboarding checklist"
- "What are CMS F-tag requirements for infection control?"`;
}

export async function POST(req: NextRequest) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const session = await getSession();
        if (!session) {
          sendEvent(controller, { type: "error", error: "Unauthorized" });
          controller.close();
          return;
        }

        const body = await req.json();
        const { question, conversationId } = body;
        const userEmail = session.email ?? null;

        // Rate limit: 30 requests per minute per user
        const rl = checkRateLimit(rateLimitKey(req, userEmail), 30, 60_000);
        if (!rl.allowed) {
          sendEvent(controller, {
            type: "error",
            error: `Too many requests. Please wait ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
            retryAfterMs: rl.retryAfterMs,
          });
          controller.close();
          return;
        }

        if (!question || typeof question !== "string") {
          sendEvent(controller, { type: "error", error: "question is required" });
          controller.close();
          return;
        }

        // PHI de-identification
        const { cleanText: sanitizedQuestion, findings: phiFindings } = deIdentifyText(question);
        const phiDetected = phiFindings.length > 0;
        const phiRedactedCount = phiFindings.reduce((sum, f) => sum + f.count, 0);
        const phiWarning = phiDetected ? { detected: true, redactedCount: phiRedactedCount } : null;

        // Schedule short-circuit — fetch from Graph API
        if (isScheduleRequest(sanitizedQuestion)) {
          const mode = isWeeklyScheduleRequest(sanitizedQuestion) ? "weekly" : "daily";
          sendStatus(controller, { status: "searching_sources", label: "Reading your Outlook calendar & emails", toolName: "outlookCalendar" });
          try {
            const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";
            const schedRes = await fetch(`${baseUrl}/api/schedule/daily?mode=${mode}`, {
              headers: { Cookie: req.headers.get("cookie") || "" },
            });
            const schedData = await schedRes.json();
            if (schedData.success) {
              sendStatus(controller, { status: "drafting", label: "Building your schedule" });
              streamText(controller, schedData.schedule);
              sendEvent(controller, {
                type: "done",
                answer: schedData.schedule,
                isSchedule: true,
                scheduleMode: mode,
                trainingMode: false,
                documentationMode: false,
                escalation: { team: null, urgency: "low", recommendedNextStep: null, shouldEscalate: false },
                verification: { answerMode: "schedule", usedInternalDocuments: false, isGeneralGuidance: false, usedConversationHistory: 0 },
                selectedAgent: { name: "executive", displayName: "Schedule Agent", icon: "📅", reason: "schedule_request" },
                sources: [],
                phiWarning: null,
              });
              controller.close();
              return;
            }
          } catch { /* fall through to normal agent */ }
        }

        // Meta question short-circuit
        if (isMetaQuestion(sanitizedQuestion)) {
          const metaAnswer = getMetaAnswer();
          streamText(controller, metaAnswer);
          sendEvent(controller, {
            type: "done",
            answer: metaAnswer,
            trainingMode: false,
            documentationMode: false,
            escalation: { team: null, urgency: "low", recommendedNextStep: null, shouldEscalate: false },
            verification: { answerMode: "general_guidance", usedInternalDocuments: false, isGeneralGuidance: true, usedConversationHistory: 0 },
            selectedAgent: { name: "internal_knowledge", ...getAgentMeta("internal_knowledge"), reason: "meta_question" },
            sources: [],
            phiWarning,
          });
          controller.close();
          return;
        }

        // Route
        sendStatus(controller, { status: "routing", label: "Routing request" });
        const router = new AgentRouter();
        const decision = router.route({ question: sanitizedQuestion, userEmail, conversationId, channel: "web" });
        const meta = { name: decision.agent, ...getAgentMeta(decision.agent), reason: decision.reason };

        sendStatus(controller, { agent: meta, status: "agent_selected", label: `${meta.displayName} selected` });

        // Load conversation history
        let conversationHistory: StoredMessage[] = [];
        if (conversationId) {
          const historyResult = await db.query(
            `select role, content from messages
             where conversation_id = $1 and not (role = 'user' and content = $2)
             order by created_at desc limit 12`,
            [conversationId, question]
          );
          conversationHistory = historyResult.rows.reverse();
        }

        sendStatus(controller, { agent: meta, status: "searching_sources", label: "Searching approved sources", toolName: "internalKnowledgeSearch" });

        // Invoke the agent
        const agent = router.getAgent(decision);
        if (!agent) {
          sendEvent(controller, { type: "error", error: `No agent found for route: ${decision.agent}` });
          controller.close();
          return;
        }

        const agentResponse = await agent.answer({
          question: sanitizedQuestion,
          user: { email: userEmail },
          resolvedRoles: ["staff"],
          channel: "web",
          tenantValidated: false,
          routeDecision: decision,
          userEmail,
          conversationId: conversationId || null,
          conversationHistory,
        });

        sendStatus(controller, { agent: meta, status: "drafting", label: "Drafting response", sourceCount: agentResponse.sources.length });

        streamText(controller, agentResponse.answer);

        // Audit log (agents set audit:false internally to avoid double-write; we write here)
        await db.query(
          `insert into audit_logs (user_email, question, answer, retrieved_sources) values ($1, $2, $3, $4)`,
          [userEmail, sanitizedQuestion, agentResponse.answer, JSON.stringify(agentResponse.sources)]
        ).catch(() => {}); // non-fatal

        // Knowledge gap tracking (deduplicated per 24h)
        const streamAnswerMode = (agentResponse.auditMetadata?.answerMode as string) ?? "general_guidance";
        if (streamAnswerMode === "general_guidance") {
          db.query(
            `INSERT INTO knowledge_gaps (question, user_email, agent, flagged_at, status)
             SELECT $1, $2, $3, now(), 'open'
             WHERE NOT EXISTS (
               SELECT 1 FROM knowledge_gaps WHERE question = $1 AND flagged_at > now() - interval '24 hours'
             )`,
            [sanitizedQuestion, userEmail ?? null, decision.agent]
          ).catch(() => {});
        }

        sendEvent(controller, {
          type: "done",
          answer: agentResponse.answer,
          trainingMode: false,
          documentationMode: decision.agent === "document_assistant",
          escalation: {
            team: null,
            urgency: agentResponse.safety.urgent ? "high" : "low",
            recommendedNextStep: null,
            shouldEscalate: false,
          },
          verification: {
            answerMode: (agentResponse.auditMetadata?.answerMode as string) ?? "general_guidance",
            usedInternalDocuments: agentResponse.auditMetadata?.answerMode === "internal_document_supported",
            isGeneralGuidance: agentResponse.auditMetadata?.answerMode === "general_guidance",
            usedConversationHistory: conversationHistory.length,
          },
          selectedAgent: meta,
          sources: agentResponse.sources,
          workflow: agentResponse.workflow ?? null,
          phiWarning,
        });

        sendStatus(controller, { agent: meta, status: "ready", label: "Ready", sourceCount: agentResponse.sources.length });

        controller.close();
      } catch (err: any) {
        console.error("[stream] Error:", err);
        sendEvent(controller, { type: "error", error: err.message ?? "Stream failed" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
