import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { AgentRouter } from "@/lib/agents/AgentRouter";
import { db } from "@/lib/db";
import { openai } from "@/lib/openai";
import { buildDocumentCreationWorkflow } from "@/lib/workflow/documentCreation";
import { deIdentifyText } from "@/lib/phi/deidentify";

export const runtime = "nodejs";

type ChatRole = "user" | "assistant";

type StoredMessage = {
  role: ChatRole;
  content: string;
};

type UrgencyLevel = "low" | "medium" | "high";

function toOpenAIMessages(messages: StoredMessage[]) {
  return messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        message.content?.trim()
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function getAnswerMode(topSimilarity: number) {
  if (topSimilarity >= 0.62) {
    return "internal_document_supported";
  }

  if (topSimilarity >= 0.48) {
    return "possible_internal_match";
  }

  return "general_guidance";
}

function getAnswerLabel({
  answerMode,
  documentationMode,
  itTroubleshootingMode,
}: {
  answerMode: string;
  documentationMode: boolean;
  itTroubleshootingMode: boolean;
}) {
  if (documentationMode) return "Generated Draft";
  if (itTroubleshootingMode) return "Troubleshooting Guidance";
  if (answerMode === "internal_document_supported") {
    return "Internal Source Summary";
  }

  return "General Knowledge";
}

type TitleMatchRow = {
  id: string;
  title: string;
  category: string;
  source: string;
  source_url: string | null;
  external_id: string | null;
  chunks: number;
};

function getTitleSearchTerms(question: string) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "do",
    "does",
    "for",
    "have",
    "is",
    "it",
    "of",
    "our",
    "policy",
    "the",
    "to",
    "we",
    "what",
    "where",
  ]);

  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4 && !stopWords.has(term))
    .slice(0, 5);
}

function hasRetrievedTitleMatch(
  question: string,
  matches: { title: string }[]
) {
  const terms = getTitleSearchTerms(question);

  if (terms.length === 0) return false;

  return matches.some((match) => {
    const title = match.title.toLowerCase();

    return terms.some((term) => title.includes(term));
  });
}

async function findActiveTitleMatches(question: string) {
  const terms = getTitleSearchTerms(question);

  if (terms.length === 0) return [] as TitleMatchRow[];

  const result = await db.query(
    `
    select
      d.id,
      d.title,
      d.category,
      d.source,
      d.source_url,
      d.external_id,
      count(dc.id)::int as chunks
    from documents d
    left join document_chunks dc
      on dc.document_id = d.id
    where
      d.is_active = true
      and (${terms.map((_, index) => `d.title ilike $${index + 1}`).join(" or ")})
    group by d.id
    order by
      count(dc.id) desc,
      d.created_at desc
    limit 5
    `,
    terms.map((term) => `%${term}%`)
  );

  return result.rows as TitleMatchRow[];
}

function buildUnreadableDocumentAnswer(documents: TitleMatchRow[]) {
  const listedDocuments = documents
    .map((document, index) => {
      const sourceLabel = [document.category, document.source]
        .filter(Boolean)
        .join(" · ");

      return `- **${document.title}**${sourceLabel ? `\n  ${sourceLabel}` : ""}`;
    })
    .join("\n");

  return `## Internal Source Summary

I found matching St. Mary's document records, but they are not fully readable by the AI yet.

These records exist in the Knowledge Library, but they do not currently have searchable text chunks. I cannot summarize or quote them until they are reindexed.

Found documents:
${listedDocuments}

Next step:

1. Open Sync Admin.
2. Queue unreadable documents for reindexing.
3. Process the sync queue.
4. Ask again after chunks are created.`;
}

function isITTroubleshootingRequest(question: string) {
  const lowerQuestion = question.toLowerCase();

  return (
    lowerQuestion.includes("troubleshoot") ||
    lowerQuestion.includes("troubleshooting") ||
    lowerQuestion.includes("not working") ||
    lowerQuestion.includes("error") ||
    lowerQuestion.includes("can't access") ||
    lowerQuestion.includes("cannot access") ||
    lowerQuestion.includes("printer") ||
    lowerQuestion.includes("copier") ||
    lowerQuestion.includes("scanner") ||
    lowerQuestion.includes("outlook") ||
    lowerQuestion.includes("teams") ||
    lowerQuestion.includes("sharepoint") ||
    lowerQuestion.includes("caretracker") ||
    lowerQuestion.includes("sigmacare") ||
    lowerQuestion.includes("unifi") ||
    lowerQuestion.includes("password")
  );
}

function getEscalationGuidance(question: string, answer: string) {
  const lowerQuestion = question.toLowerCase();
  const lowerAnswer = answer.toLowerCase();
  const combined = `${lowerQuestion} ${lowerAnswer}`;

  let team: string | null = null;
  let urgency: UrgencyLevel = "low";
  let recommendedNextStep: string | null = null;

  if (
    combined.includes("printer") ||
    combined.includes("copier") ||
    combined.includes("scanner") ||
    combined.includes("outlook") ||
    combined.includes("sharepoint") ||
    combined.includes("password") ||
    combined.includes("voicemail") ||
    combined.includes("computer") ||
    combined.includes("laptop") ||
    combined.includes("teams") ||
    combined.includes("caretracker") ||
    combined.includes("sigmacare") ||
    combined.includes("email") ||
    combined.includes("login") ||
    combined.includes("access")
  ) {
    team = "IT Support";
    recommendedNextStep =
      "If the issue continues after basic troubleshooting, contact IT Support with the user, device, screenshot, and exact error.";
  }

  if (
    combined.includes("payroll") ||
    combined.includes("paycheck") ||
    combined.includes("pto") ||
    combined.includes("timecard") ||
    combined.includes("benefits")
  ) {
    team = "HR / Payroll";
    recommendedNextStep =
      "Escalate to HR or Payroll with the employee name, date, and specific payroll or timecard concern.";
  }

  if (
    combined.includes("medication") ||
    combined.includes("clinical") ||
    combined.includes("resident care") ||
    combined.includes("patient") ||
    combined.includes("nursing") ||
    combined.includes("care plan")
  ) {
    team = "Clinical Leadership";
    recommendedNextStep =
      "Escalate to nursing leadership or the appropriate clinical supervisor. Do not rely on AI for clinical decisions.";
    urgency = "medium";
  }

  if (
    combined.includes("door") ||
    combined.includes("alarm") ||
    combined.includes("badge access") ||
    combined.includes("camera") ||
    combined.includes("security") ||
    combined.includes("keypad")
  ) {
    team = "IT Support / Security";
    recommendedNextStep =
      "For access-control, camera, keypad, or door system issues, escalate to IT Support first and involve Security if it affects physical access or safety.";
  }

  if (
    lowerQuestion.includes("maintenance") ||
    lowerQuestion.includes("hvac") ||
    lowerQuestion.includes("water leak") ||
    lowerQuestion.includes("plumbing") ||
    lowerQuestion.includes("electrical")
  ) {
    team = "Maintenance";
    recommendedNextStep =
      "Escalate to Maintenance with the location, room/unit, urgency, and photos if available.";
  }

  if (
    combined.includes("urgent") ||
    combined.includes("emergency") ||
    combined.includes("unsafe") ||
    combined.includes("danger") ||
    combined.includes("fire") ||
    combined.includes("flood") ||
    combined.includes("injury") ||
    combined.includes("outage")
  ) {
    urgency = "high";
  }

  if (!team && urgency === "high") {
    team = "Leadership / Supervisor";
    recommendedNextStep =
      "Escalate immediately to the appropriate supervisor or leadership contact for the area involved.";
  }

  return {
    team,
    urgency,
    recommendedNextStep,
    shouldEscalate: Boolean(team),
  };
}

function isTrainingOrOnboardingRequest(question: string) {
  const lowerQuestion = question.toLowerCase();

  return (
    lowerQuestion.includes("how do i") ||
    lowerQuestion.includes("walk me through") ||
    lowerQuestion.includes("setup") ||
    lowerQuestion.includes("set up") ||
    lowerQuestion.includes("configure") ||
    lowerQuestion.includes("onboard") ||
    lowerQuestion.includes("install") ||
    lowerQuestion.includes("create account") ||
    lowerQuestion.includes("training") ||
    lowerQuestion.includes("show me how") ||
    lowerQuestion.includes("steps") ||
    lowerQuestion.includes("procedure") ||
    lowerQuestion.includes("process")
  );
}

function isDocumentationAssistantRequest(question: string) {
  const lowerQuestion = question.toLowerCase();

  return (
    lowerQuestion.includes("write") ||
    lowerQuestion.includes("draft") ||
    lowerQuestion.includes("create a form") ||
    lowerQuestion.includes("create an sop") ||
    lowerQuestion.includes("generate") ||
    lowerQuestion.includes("incident report") ||
    lowerQuestion.includes("checklist") ||
    lowerQuestion.includes("template") ||
    lowerQuestion.includes("documentation") ||
    lowerQuestion.includes("document this") ||
    lowerQuestion.includes("make a policy") ||
    lowerQuestion.includes("make an sop") ||
    lowerQuestion.includes("request form") ||
    lowerQuestion.includes("troubleshooting guide") ||
    lowerQuestion.includes("professional email")
  );
}

function isMetaQuestion(question: string): boolean {
  const q = question.toLowerCase().trim();
  return (
    q.includes("what agents") ||
    q.includes("which agents") ||
    q.includes("what can you do") ||
    q.includes("what do you do") ||
    q.includes("what are you") ||
    q.includes("who are you") ||
    q.includes("who works here") ||
    q.includes("what tools do you") ||
    (q.includes("agents") && (q.includes("available") || q.includes("have") || q.includes("got"))) ||
    q === "help" ||
    q === "capabilities" ||
    q.includes("your capabilities") ||
    q.includes("what workforce")
  );
}

function getMetaAnswer(): string {
  return `St. Mary\'s AI Workforce currently has **5 specialized agents**:

- 📋 **Policy Agent** — answers questions about policies, SOPs, procedures, and internal processes.
- 👥 **HR Agent** — helps draft onboarding checklists, orientation materials, and staff communications.
- 🖥 **IT Support Agent** — helps troubleshoot printers, passwords, Outlook, Teams, SharePoint, CareTracker, SigmaCare, and hardware.
- 📊 **Executive Agent** — prepares leadership summaries, operational overviews, risks, and recommendations.
- 🏥 **Medical Education Agent** — provides general health education only. It does not provide diagnosis, treatment, or resident-specific advice.

**Example requests**

- "Summarize the attendance policy"
- "Create a new nurse onboarding checklist"
- "Troubleshoot a SigmaCare login issue"
- "What are signs of dehydration?"`;
}

function sendEvent(controller: ReadableStreamDefaultController, data: unknown) {
  const encoder = new TextEncoder();

  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
  );
}

function streamText(controller: ReadableStreamDefaultController, answer: string) {
  const chunkSize = 180;

  for (let index = 0; index < answer.length; index += chunkSize) {
    sendEvent(controller, {
      type: "token",
      token: answer.slice(index, index + chunkSize),
    });
  }
}

function getSelectedAgentMetadata(agentName: string, reason?: string) {
  const agents: Record<string, { displayName: string; icon: string }> = {
    internal_knowledge: {
      displayName: "Policy Agent",
      icon: "📋",
    },
    policy: {
      displayName: "Policy Agent",
      icon: "📋",
    },
    it_support: {
      displayName: "IT Support Agent",
      icon: "🖥",
    },
    document_assistant: {
      displayName: "HR Agent",
      icon: "👥",
    },
    medical_education: {
      displayName: "Medical Education Agent",
      icon: "🏥",
    },
    executive: {
      displayName: "Executive Agent",
      icon: "📊",
    },
  };
  const agent = agents[agentName] || agents.internal_knowledge;

  return {
    name: agentName,
    displayName: agent.displayName,
    icon: agent.icon,
    reason,
  };
}

function sendAgentStatus(
  controller: ReadableStreamDefaultController,
  {
    agent,
    status,
    label,
    sourceCount,
    toolName,
    workflowId,
  }: {
    agent?: ReturnType<typeof getSelectedAgentMetadata>;
    status:
      | "routing"
      | "agent_selected"
      | "searching_sources"
      | "checking_safety"
      | "drafting"
      | "ready"
      | "error";
    label: string;
    sourceCount?: number;
    toolName?: string;
    workflowId?: string;
  }
) {
  sendEvent(controller, {
    type: "agent_status",
    agent,
    status,
    label,
    sourceCount,
    toolName,
    workflowId,
  });
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
        const userDisplayName = session.name ?? null;

        if (!question || typeof question !== "string") {
          sendEvent(controller, {
            type: "error",
            error: "question is required",
          });
          controller.close();
          return;
        }

        const { cleanText: sanitizedQuestion, findings: phiFindings } = deIdentifyText(question);
        const phiDetected = phiFindings.length > 0;
        const phiRedactedCount = phiFindings.reduce((sum, f) => sum + f.count, 0);

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
            selectedAgent: getSelectedAgentMetadata("internal_knowledge", "meta_question"),
            sources: [],
            phiWarning: phiDetected ? { detected: true, redactedCount: phiRedactedCount } : null,
          });
          controller.close();
          return;
        }

        const router = new AgentRouter();
        sendAgentStatus(controller, {
          status: "routing",
          label: "Routing request",
        });
        const routeDecision = router.route({
          question: sanitizedQuestion,
          userEmail,
          conversationId,
          channel: "web",
        });
        const selectedAgentMeta = getSelectedAgentMetadata(
          routeDecision.agent,
          routeDecision.reason
        );
        sendAgentStatus(controller, {
          agent: selectedAgentMeta,
          status: "agent_selected",
          label: `${selectedAgentMeta.displayName} selected`,
        });

        if (routeDecision.agent === "document_assistant") {
          try {
            const selectedAgent = router.getAgent(routeDecision);
            const agentResponse = await selectedAgent?.answer({
              question: sanitizedQuestion,
              user: {
                email: userEmail || null,
              },
              resolvedRoles: ["staff"],
              channel: "web",
              tenantValidated: false,
              routeDecision,
              userEmail: userEmail || null,
              conversationId: conversationId || null,
            });
            const draftAnswer = agentResponse?.answer || "";
            const usedDraftDocument = agentResponse?.toolsUsed.some(
              (tool) => tool.toolName === "draftDocument" && tool.success
            );

            if (draftAnswer && usedDraftDocument) {
              const labeledDraftAnswer = /^#{1,3}\s*Generated Draft\b/i.test(
                draftAnswer.trim()
              )
                ? draftAnswer.trim()
                : `## Generated Draft\n\n${draftAnswer.trim()}`;

              streamText(controller, labeledDraftAnswer);

              await db.query(
                `
                insert into audit_logs
                (user_email, question, answer, retrieved_sources)
                values ($1, $2, $3, $4)
                `,
                [
                  userEmail || null,
                  sanitizedQuestion,
                  labeledDraftAnswer,
                  JSON.stringify({
                    route: routeDecision,
                    source: "draftDocument",
                  }),
                ]
              );

              sendAgentStatus(controller, {
                agent: selectedAgentMeta,
                status: "drafting",
                label: "Drafting response",
                toolName: "draftDocument",
              });

              sendEvent(controller, {
                type: "done",
                answer: labeledDraftAnswer,
                trainingMode: false,
                documentationMode: true,
                escalation: {
                  team: null,
                  urgency: "low",
                  recommendedNextStep: null,
                  shouldEscalate: false,
                },
                verification: {
                  answerMode: "general_guidance",
                  usedInternalDocuments: false,
                  isGeneralGuidance: true,
                  usedConversationHistory: 0,
                },
                selectedAgent: selectedAgentMeta,
                sources: [],
                workflow: buildDocumentCreationWorkflow(
                  selectedAgentMeta.displayName
                ),
                phiWarning: phiDetected ? { detected: true, redactedCount: phiRedactedCount } : null,
              });
              sendAgentStatus(controller, {
                agent: selectedAgentMeta,
                status: "ready",
                label: "Ready",
                workflowId: "document_assistant_stream",
              });

              controller.close();
              return;
            }
          } catch (documentAgentError) {
            console.warn(
              "DocumentAssistant stream route failed; falling back to RAG stream:",
              documentAgentError
            );
          }
        }

        let conversationHistory: StoredMessage[] = [];

        if (conversationId) {
          const historyResult = await db.query(
            `
            select role, content
            from messages
            where
              conversation_id = $1
              and not (role = 'user' and content = $2)
            order by created_at desc
            limit 12
            `,
            [conversationId, question]
          );

          conversationHistory = historyResult.rows.reverse();
        }

        const embeddingResult = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: sanitizedQuestion,
        });

        const questionEmbedding = embeddingResult.data[0].embedding;

        sendAgentStatus(controller, {
          agent: selectedAgentMeta,
          status: "searching_sources",
          label: "Searching approved sources",
          toolName: "internalKnowledgeSearch",
        });
        const matches = await db.query(
          `
          select
            m.id,
            m.document_id,
            m.content,
            coalesce(m.source_url, d.source_url) as source_url,
            m.similarity,
            d.title,
            d.category,
            d.source
          from match_document_chunks($1::vector, $2) m
          join documents d
            on d.id = m.document_id
          where
            d.is_active = true
          order by m.similarity desc
          `,
          [`[${questionEmbedding.join(",")}]`, 7]
        );

        const topSimilarity = Number(matches.rows[0]?.similarity || 0);
        sendAgentStatus(controller, {
          agent: selectedAgentMeta,
          status: "checking_safety",
          label: "Checking source confidence",
          sourceCount: matches.rows.length,
        });
        let answerMode = getAnswerMode(topSimilarity);
        const trainingMode = isTrainingOrOnboardingRequest(question);
        const documentationMode = isDocumentationAssistantRequest(question);
        const itTroubleshootingMode = isITTroubleshootingRequest(question);

        const titleMatches =
          answerMode !== "internal_document_supported"
            ? await findActiveTitleMatches(sanitizedQuestion)
            : [];

        const titleMatchesWithoutChunks = titleMatches.filter(
          (document) => Number(document.chunks || 0) === 0
        );
        const titleMatchesWithChunks = titleMatches.filter(
          (document) => Number(document.chunks || 0) > 0
        );

        if (
          titleMatchesWithoutChunks.length > 0 &&
          matches.rows.length === 0
        ) {
          const unreadableAnswer = buildUnreadableDocumentAnswer(
            titleMatchesWithoutChunks
          );
          const unreadableSources = titleMatchesWithoutChunks.map((document) => ({
            id: `document:${document.id}`,
            documentId: document.id,
            title: document.title,
            category: document.category,
            source: document.source,
            sourceUrl: document.source_url,
            externalId: document.external_id,
            similarity: 1,
            chunkIndex: null,
          }));

          streamText(controller, unreadableAnswer);

          await db.query(
            `
            insert into audit_logs
            (user_email, question, answer, retrieved_sources)
            values ($1, $2, $3, $4)
            `,
            [
              userEmail || null,
              sanitizedQuestion,
              unreadableAnswer,
              JSON.stringify(unreadableSources),
            ]
          );

          sendAgentStatus(controller, {
            agent: selectedAgentMeta,
            status: "ready",
            label: "Document found but not indexed",
            sourceCount: 0,
          });

          sendEvent(controller, {
            type: "done",
            answer: unreadableAnswer,
            trainingMode,
            documentationMode,
            escalation: {
              team: null,
              urgency: "low",
              recommendedNextStep: null,
              shouldEscalate: false,
            },
            verification: {
              answerMode: "possible_internal_match",
              usedInternalDocuments: false,
              isGeneralGuidance: false,
              usedConversationHistory: conversationHistory.length,
            },
            selectedAgent: selectedAgentMeta,
            phiWarning: phiDetected
              ? { detected: true, redactedCount: phiRedactedCount }
              : null,
            sources: unreadableSources,
          });

          controller.close();
          return;
        }

        if (
          answerMode !== "internal_document_supported" &&
          topSimilarity >= 0.48 &&
          (titleMatchesWithChunks.length > 0 ||
            hasRetrievedTitleMatch(sanitizedQuestion, matches.rows))
        ) {
          answerMode = "internal_document_supported";
        }

        const answerLabel = getAnswerLabel({
          answerMode,
          documentationMode,
          itTroubleshootingMode,
        });
        const answerPrefix = `## ${answerLabel}\n\n`;

        const context = matches.rows
          .map((row: any, index: number) => {
            return `
Source ${index + 1}
Document: ${row.title}
Category: ${row.category}
Similarity: ${row.similarity}

${row.content}
            `.trim();
          })
          .join("\n\n-------------------\n\n");

        const openAIStream = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          stream: true,
          messages: [
            {
              role: "system",
              content: `
You are St. Mary's internal AI knowledge assistant and operational copilot.

Your job:
- Help staff solve operational, IT, SharePoint, CareTracker, SigmaCare, phone, printer, onboarding, and workflow issues.
- Use conversation history to understand follow-up questions.
- Prefer active St. Mary's internal documents when they clearly match the question.
- If retrieved documents are weak, mismatched, outdated, incomplete, or unrelated, say "No approved internal source found." before giving generated guidance.
- Be transparent, but do NOT show numeric confidence scores.
- Do not invent St. Mary's policies.
- Do not invent operational policy details, required approvals, official steps, deadlines, penalties, benefits, or ownership rules.
- Do not provide medical advice or clinical decisions.
- If the user asks for official policy, only use internal documents. If not found, say you could not find an approved St. Mary's policy.
- If the user asks general operational/IT troubleshooting, you may use general knowledge when internal docs are missing or weak.
- If the user's question is ambiguous and history does not clarify it, ask 1-3 smart follow-up questions.
- Keep answers practical, step-by-step, and helpful.

Formatting rules:
- Always format your response using proper markdown:
  - Use ## or ### for section headings.
  - Use - or * for bullet lists. Never use plain newline-separated items for lists.
  - Use **bold** for key terms, labels, and field names.
  - Use numbered lists (1. 2. 3.) for sequential steps.
  - Separate sections with a blank line.
  - Never return a list as raw newlines without bullet syntax.
- Make answers easy to scan. Use short paragraphs, clear section labels, and real markdown bullets.
- Do not create long vertical laundry lists where every single record gets its own line.
- Group related records into compact bullets. Each bullet should combine related items using commas.
- If listing records, requirements, systems, steps, examples, or exceptions, use markdown bullets or numbered lists, but keep the list short.
- Put a blank line before each major section.
- For policy summaries, use this exact structure:
  1. One short intro sentence.
  2. Markdown heading: ### Purpose
  3. Markdown heading: ### Retention Period
  4. Markdown heading: ### Records Covered, followed by 3-5 grouped bullet points.
  5. Markdown heading: ### Additional Records, followed by bullet points when applicable.
  6. Markdown heading: ### Source Note
- Keep each bullet focused on one idea.
- Prefer grouped bullets like:
  - Personnel actions: hiring, termination, promotion, transfer, layoff, leave of absence, and corrective actions.
  - Payroll and tax records: payroll records, W-4/W-2 forms, time sheets, and wage/salary scales.
- Do not output raw asterisks as decoration or separators.

Training and onboarding behavior:
- When the user asks operational or onboarding questions, prefer structured step-by-step responses.
- Use numbered lists when appropriate.
- Explain prerequisite systems, permissions, or approvals.
- Mention dependency order when systems rely on each other.
- Separate prerequisites, steps, troubleshooting, and escalation when useful.

Documentation assistant behavior:
- Help create professional operational documentation such as SOPs, onboarding checklists, incident reports, troubleshooting guides, email templates, request forms, and procedures.
- Prefer clean formatting with sections and headings.
- Use concise enterprise/professional wording.
- Keep outputs practical and realistic for internal operations.
- When drafting documentation, avoid inventing St. Mary's official policy details.
- If internal documents support the draft, use them as the base.
- If the user is asking for a draft or template, make it editable and ready to copy.
- Use placeholders like [Name], [Date], [Department], [System], or [Issue] when helpful.

Escalation behavior:
- If an issue likely requires human intervention, clearly recommend who should handle it.
- Printers, copiers, scanners, Outlook, SharePoint, Microsoft 365, Teams, passwords, phones/voicemail, SigmaCare, CareTracker, laptops, accounts, and access issues go to IT Support.
- Door access, UniFi, cameras, keypads, and badge/access-control issues usually go to IT Support first, with Security involved if physical access or safety is affected.
- HR, payroll, PTO, timecard, or benefits issues go to HR / Payroll.
- Clinical workflow, medication, resident care, or patient-care issues go to Nursing Leadership or the clinical supervisor.
- Building, HVAC, plumbing, electrical, leaks, or physical plant issues go to Maintenance.
- If the issue sounds urgent, unsafe, or emergency-related, clearly say it should be escalated immediately.

How to phrase verification:
- The answer label has already been emitted to the user. Do not add another heading label.
- If answer mode is general_guidance or no useful internal source exists, do not present the response as approved St. Mary's policy.
- When answering from internal knowledge, summarize only what the retrieved active internal source supports. Do not fill gaps with invented operational details.
- When internal documents clearly support the answer, start naturally with: "Based on the St. Mary's document I found..."
- When documents are only possibly related, say: "I found a possible related St. Mary's document, but this may need verification..."
- When no useful internal document is found, say: "No approved internal source found."
- If the answer is general guidance, avoid presenting it as St. Mary's official procedure.
- Do not mention similarity scores, thresholds, embeddings, retrieval, or vector search to the user.
              `.trim(),
            },
            ...toOpenAIMessages(conversationHistory),
            {
              role: "user",
              content: `
Current question:
${sanitizedQuestion}

Answer mode:
${answerMode}

Training/onboarding mode:
${trainingMode ? "true" : "false"}

Documentation assistant mode:
${documentationMode ? "true" : "false"}

IT troubleshooting mode:
${itTroubleshootingMode ? "true" : "false"}

Answer label already emitted:
${answerLabel}

Retrieved active internal knowledge:
${context || "No active internal context found."}
              `.trim(),
            },
          ],
          temperature: 0.35,
        });

        let fullAnswer = answerPrefix;

        streamText(controller, answerPrefix);
        sendAgentStatus(controller, {
          agent: selectedAgentMeta,
          status: "drafting",
          label: "Drafting response",
          sourceCount: matches.rows.length,
        });

        for await (const chunk of openAIStream) {
          const token = chunk.choices[0]?.delta?.content || "";

          if (token) {
            fullAnswer += token;

            sendEvent(controller, {
              type: "token",
              token,
            });
          }
        }

        const escalation = getEscalationGuidance(sanitizedQuestion, fullAnswer);

        await db.query(
          `
          insert into audit_logs
          (user_email, question, answer, retrieved_sources)
          values ($1, $2, $3, $4)
          `,
          [userEmail || null, sanitizedQuestion, fullAnswer, JSON.stringify(matches.rows)]
        );

        sendEvent(controller, {
          type: "done",
          answer: fullAnswer,
          trainingMode,
          documentationMode,
          escalation,
          verification: {
            answerMode,
            usedInternalDocuments: answerMode === "internal_document_supported",
            isGeneralGuidance: answerMode === "general_guidance",
            usedConversationHistory: conversationHistory.length,
          },
          selectedAgent: getSelectedAgentMetadata(
            routeDecision.agent,
            routeDecision.reason
          ),
          phiWarning: phiDetected ? { detected: true, redactedCount: phiRedactedCount } : null,
          sources: matches.rows.map((row: any) => ({
            id: row.id,
            documentId: row.document_id,
            title: row.title,
            category: row.category,
            source: row.source,
            sourceUrl: row.source_url,
            similarity: row.similarity,
          })),
        });
        sendAgentStatus(controller, {
          agent: selectedAgentMeta,
          status: "ready",
          label: "Ready",
          sourceCount: matches.rows.length,
        });

        controller.close();
      } catch (error: any) {
        console.error("CHAT_STREAM_ERROR:", error);

        sendEvent(controller, {
          type: "agent_status",
          status: "error",
          label: "Agent workflow failed",
        });

        sendEvent(controller, {
          type: "error",
          error: error.message || "Failed to stream answer",
        });

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
