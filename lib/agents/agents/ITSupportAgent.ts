import type { Agent, AgentRequest, AgentResponse } from "../types";
import { ToolRegistry } from "@/lib/tools/ToolRegistry";
import { openai } from "@/lib/openai";
import { deIdentifyText } from "@/lib/phi/deidentify";
import { resolveCategory, getCategoryLabel } from "@/lib/integrations/issuetrak/categoryResolver";
import { buildTicketCreationWorkflow } from "@/lib/workflow/ticketCreation";
import type { IssuetrakCategory, IssuetrakPriority } from "@/lib/integrations/issuetrak/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const TICKET_INTENT_KEYWORDS = [
  "submit a ticket", "open a ticket", "create a ticket", "log a ticket",
  "submit ticket", "open ticket", "create ticket", "log ticket",
  "log an issue", "report an issue", "file a ticket", "raise a ticket",
  "put in a ticket", "need a ticket", "submit a request", "it request",
  "helpdesk", "help desk", "it help",
];

const CONFIRM_PHRASES = [
  "yes", "confirm", "go ahead", "submit it", "looks good", "ok", "correct",
  "that's right", "yep", "yup", "sure", "do it", "proceed", "send it",
];

const CANCEL_PHRASES = [
  "no", "cancel", "stop", "change", "wrong", "edit", "wait", "hold on",
  "don't", "nevermind", "never mind",
];

const URGENT_WORDS = [
  "urgent", "asap", "emergency", "critical", "immediately", "right now",
  "can't work", "cannot work", "system down", "down",
];

const IT_KEYWORDS = [
  "caretracker", "sigmacare", "microsoft 365", "office 365", "outlook",
  "teams", "sharepoint", "unifi", "printer", "scanner", "copier",
  "password", "login", "email", "computer", "laptop", "network",
  "wifi", "wi-fi",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type PartialTicket = {
  subject?: string;
  description?: string;
  requesterEmail?: string;
  requesterName?: string;
  locationUnit?: string;
  category?: IssuetrakCategory;
  priority?: IssuetrakPriority;
};

// ─── Field Extractor ─────────────────────────────────────────────────────────

async function extractTicketFields(
  conversationText: string,
  userEmail: string | null | undefined,
  userDisplayName: string | null | undefined
): Promise<PartialTicket> {
  const systemPrompt = `You are a field extractor for an IT support ticket system.
Extract structured ticket fields from the conversation below.
Return ONLY a valid JSON object with these fields (omit any field you cannot determine):
{
  "subject": string (5-80 chars, concise problem title),
  "description": string (full problem description),
  "locationUnit": string (specific unit, floor, building, or area),
  "category": one of: printer|password_reset|software|hardware|network|email_outlook|caretracker|sigmacare|sharepoint|other,
  "priority": one of: normal|high|urgent
}

Rules:
- Never include resident names, room numbers, diagnoses, medications, or clinical information.
- Extract location from phrases like "in Area 2", "3rd floor", "nurses station", "admin office", etc.
- Priority is "urgent" only if user says urgent/ASAP/emergency/system down. Default to "normal".
- Category must be one of the exact enum values listed.
- If a field cannot be reliably extracted, omit it entirely.
- Return only valid JSON. No explanation.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: conversationText.slice(-3000) },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as PartialTicket;

    // Inject identity from session
    if (userEmail && !parsed.requesterEmail) {
      parsed.requesterEmail = userEmail;
    }
    if (userDisplayName && !parsed.requesterName) {
      parsed.requesterName = userDisplayName;
    }

    return parsed;
  } catch {
    return {
      requesterEmail: userEmail ?? undefined,
      requesterName: userDisplayName ?? undefined,
    };
  }
}

// ─── Confirmation Helpers ─────────────────────────────────────────────────────

function isConfirmation(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return CONFIRM_PHRASES.some((p) => lower === p || lower.startsWith(p + " ") || lower.endsWith(" " + p));
}

function isCancellation(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return CANCEL_PHRASES.some((p) => lower === p || lower.startsWith(p + " "));
}

function detectTicketIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return TICKET_INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

function detectPriority(text: string): IssuetrakPriority {
  const lower = text.toLowerCase();
  if (URGENT_WORDS.some((w) => lower.includes(w))) return "urgent";
  return "normal";
}

// ─── Confirmation Summary Builder ────────────────────────────────────────────

function buildConfirmationSummary(ticket: Required<PartialTicket>): string {
  const catLabel = getCategoryLabel(ticket.category);
  const priorityLabel =
    ticket.priority === "urgent" ? "Urgent" :
    ticket.priority === "high"   ? "High"   : "Normal";

  return `## Ticket Ready to Submit

Here's what will be submitted to IT:

| Field | Value |
|---|---|
| **Subject** | ${ticket.subject} |
| **Description** | ${ticket.description} |
| **Submitted by** | ${ticket.requesterName} (${ticket.requesterEmail}) |
| **Location** | ${ticket.locationUnit} |
| **Category** | ${catLabel} |
| **Priority** | ${priorityLabel} |
| **Queue** | IT Support |

Reply **yes** or **confirm** to submit, or tell me what to change.`;
}

// ─── Conversation History Scanner ────────────────────────────────────────────

function hasPriorConfirmationPending(history: { role: string; content: string }[]): boolean {
  // Check if the last assistant message contains "Ticket Ready to Submit"
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") {
      return history[i].content.includes("Ticket Ready to Submit");
    }
  }
  return false;
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export class ITSupportAgent implements Agent {
  name = "it_support" as const;
  mode = "it_support" as const;
  private readonly toolRegistry = new ToolRegistry();

  canHandle(request: AgentRequest) {
    const question = request.question.toLowerCase();
    return (
      IT_KEYWORDS.some((kw) => question.includes(kw)) ||
      detectTicketIntent(question)
    );
  }

  async answer(request: AgentRequest): Promise<AgentResponse> {
    const history = request.conversationHistory ?? [];
    const userEmail =
      request.user?.email ?? request.user?.identity?.email ?? request.userEmail ?? null;
    const userDisplayName =
      request.user?.displayName ?? request.user?.identity?.displayName ?? null;

    const toolContext = {
      userEmail,
      userRoles: request.resolvedRoles ?? ["service"],
      selectedAgent: this.name,
      channel: request.channel ?? "web",
      agentRunId: request.routeDecision
        ? `${request.routeDecision.agent}:${request.routeDecision.reason}`
        : null,
      observeOnly: true,
    };

    const question = request.question;
    const lowerQuestion = question.toLowerCase();

    // ── Path 1: Pending confirmation — user is responding to "Ticket Ready to Submit" ──
    if (hasPriorConfirmationPending(history)) {
      if (isConfirmation(question)) {
        // Re-derive ticket from full conversation
        const fullHistory = [
          ...history.map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`),
          `User: ${question}`,
        ].join("\n");

        const ticket = await extractTicketFields(fullHistory, userEmail, userDisplayName);

        const isComplete =
          ticket.subject &&
          ticket.description &&
          ticket.requesterEmail &&
          ticket.locationUnit;

        if (!isComplete) {
          return {
            answer: "I couldn't recover the ticket details from our conversation. Could you describe the issue again so I can submit it?",
            agent: this.name,
            mode: this.mode,
            sources: [],
            safety: { blocked: false, phiDetected: false, residentSpecific: false, urgent: false },
            toolsUsed: [],
            auditMetadata: {},
          };
        }

        // PHI scrub
        const { cleanText: cleanSubject, findings: subjectFindings } = deIdentifyText(ticket.subject!);
        const { cleanText: cleanDesc, findings: descFindings } = deIdentifyText(ticket.description!);
        const phiCount = [...subjectFindings, ...descFindings].reduce((a, f) => a + f.count, 0);

        const categoryResolution = resolveCategory(`${cleanSubject} ${cleanDesc}`);

        const toolInput = {
          subject: cleanSubject,
          description: cleanDesc,
          requesterEmail: ticket.requesterEmail!,
          requesterName: ticket.requesterName ?? "St. Mary's Staff",
          locationUnit: ticket.locationUnit!,
          category: categoryResolution.category,
          priority: ticket.priority ?? "normal",
        };

        const toolResult = await this.toolRegistry.call(
          "createIssuetrakTicket",
          toolInput,
          toolContext
        );

        const resultData = toolResult.data as {
          status?: string;
          ticketNumber?: string;
          ticketUrl?: string;
          message?: string;
        } | undefined;

        const workflow = buildTicketCreationWorkflow(
          "IT Support",
          resultData?.status === "created" ? "created" : "confirmation",
          resultData?.ticketNumber
        );

        let answer: string;
        if (resultData?.status === "created") {
          answer = `Your IT ticket has been submitted successfully!\n\n**Ticket Number:** ${resultData.ticketNumber}\n\nThe IT team will follow up with you. You can also check the status at: ${resultData.ticketUrl ?? "your IT helpdesk portal"}.`;
        } else if (resultData?.status === "dry_run") {
          answer = `**(Test mode)** Your ticket would have been submitted to IT.\n\n${resultData.message ?? ""}\n\nWhen the Issuetrak integration is enabled, this will create a real ticket.`;
        } else {
          answer = `I wasn't able to submit the ticket to the IT system. ${resultData?.message ?? "Please contact IT directly at infotechsupport@smhdc.org or ext. 5800."}`
        }

        return {
          answer,
          agent: this.name,
          mode: this.mode,
          sources: [],
          safety: {
            blocked: false,
            phiDetected: phiCount > 0,
            residentSpecific: false,
            urgent: ticket.priority === "urgent",
          },
          toolsUsed: [
            {
              toolName: "createIssuetrakTicket",
              success: toolResult.success,
              inputSummary: `Ticket: ${cleanSubject} | Category: ${categoryResolution.category} | PHI redactions: ${phiCount}`,
              outputSummary: resultData?.status ?? "unknown",
            },
          ],
          auditMetadata: {
            ticketStatus: resultData?.status,
            ticketNumber: resultData?.ticketNumber,
            phiRedactions: phiCount,
            category: categoryResolution.category,
          },
          workflow,
        };
      }

      if (isCancellation(question)) {
        return {
          answer: "No problem — the ticket has been cancelled. Let me know if you need anything else.",
          agent: this.name,
          mode: this.mode,
          sources: [],
          safety: { blocked: false, phiDetected: false, residentSpecific: false, urgent: false },
          toolsUsed: [],
          auditMetadata: {},
        };
      }

      // Ambiguous reply — re-ask but continue collecting details
    }

    // ── Path 2: User wants to create a ticket ──
    if (detectTicketIntent(lowerQuestion)) {
      const fullHistory = [
        ...history.map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`),
        `User: ${question}`,
      ].join("\n");

      const ticket = await extractTicketFields(fullHistory, userEmail, userDisplayName);

      // Clarifying questions — ask one at a time
      if (!ticket.requesterEmail) {
        return {
          answer: "I can help you submit an IT ticket. First, what's your email address?",
          agent: this.name,
          mode: this.mode,
          sources: [],
          safety: { blocked: false, phiDetected: false, residentSpecific: false, urgent: false },
          toolsUsed: [],
          auditMetadata: {},
        };
      }

      if (!ticket.locationUnit || ticket.locationUnit.trim().length < 2) {
        return {
          answer: "Got it. Which unit, floor, or area are you located in?",
          agent: this.name,
          mode: this.mode,
          sources: [],
          safety: { blocked: false, phiDetected: false, residentSpecific: false, urgent: false },
          toolsUsed: [],
          auditMetadata: {},
        };
      }

      if (!ticket.description || ticket.description.trim().length < 20) {
        return {
          answer: "Can you describe the issue in a bit more detail so I can include it in the ticket?",
          agent: this.name,
          mode: this.mode,
          sources: [],
          safety: { blocked: false, phiDetected: false, residentSpecific: false, urgent: false },
          toolsUsed: [],
          auditMetadata: {},
        };
      }

      // All fields present — build confirmation summary
      const { cleanText: cleanSubject } = deIdentifyText(ticket.subject ?? ticket.description!.slice(0, 80));
      const { cleanText: cleanDesc } = deIdentifyText(ticket.description!);

      const categoryResolution = resolveCategory(`${cleanSubject} ${cleanDesc}`);
      const priority = ticket.priority ?? detectPriority(question);

      const fullTicket: Required<PartialTicket> = {
        subject: cleanSubject || "IT Support Request",
        description: cleanDesc,
        requesterEmail: ticket.requesterEmail,
        requesterName: ticket.requesterName ?? userDisplayName ?? "St. Mary's Staff",
        locationUnit: ticket.locationUnit,
        category: ticket.category ?? categoryResolution.category,
        priority,
      };

      const summary = buildConfirmationSummary(fullTicket);

      const workflow = buildTicketCreationWorkflow("IT Support", "confirmation");

      return {
        answer: summary,
        agent: this.name,
        mode: this.mode,
        sources: [],
        safety: {
          blocked: false,
          phiDetected: false,
          residentSpecific: false,
          urgent: priority === "urgent",
        },
        toolsUsed: [],
        auditMetadata: { pendingTicket: true },
        workflow,
      };
    }

    // ── Path 3: General IT question (not a ticket request) ──
    await this.toolRegistry.call("searchITKnowledge", { query: question }, toolContext);

    return {
      answer: "I'm the IT Support assistant. I can help with technical issues, software problems, account access, and more — or I can submit an IT helpdesk ticket for you. What do you need help with?",
      agent: this.name,
      mode: this.mode,
      sources: [],
      safety: { blocked: false, phiDetected: false, residentSpecific: false, urgent: false },
      toolsUsed: [
        {
          toolName: "searchITKnowledge",
          success: true,
          inputSummary: "General IT query.",
          outputSummary: "Observe-only stub.",
        },
      ],
      auditMetadata: {},
    };
  }
}
