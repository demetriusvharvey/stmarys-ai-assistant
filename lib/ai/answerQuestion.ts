import { db } from "@/lib/db";
import { openai } from "@/lib/openai";

export type ChatRole = "user" | "assistant";

export type StoredMessage = {
  role: ChatRole;
  content: string;
};

export type UrgencyLevel = "low" | "medium" | "high";

export type AnswerMode =
  | "internal_document_supported"
  | "possible_internal_match"
  | "general_guidance";

export type AnswerSource = {
  id: string;
  documentId: string;
  title: string;
  category: string;
  source: string;
  sourceUrl: string | null;
  externalId: string | null;
  similarity: number | string;
  chunkIndex: number | null;
};

export type Escalation = {
  team: string | null;
  urgency: UrgencyLevel;
  recommendedNextStep: string | null;
  shouldEscalate: boolean;
};

export type AnswerQuestionInput = {
  question: string;
  userEmail?: string | null;
  conversationId?: string | null;
  conversationHistory?: StoredMessage[];
  limit?: number;
  category?: string | null;
  audit?: boolean;
};

export type AnswerQuestionResult = {
  answer: string;
  trainingMode: boolean;
  documentationMode: boolean;
  escalation: Escalation;
  verification: {
    answerMode: AnswerMode;
    usedInternalDocuments: boolean;
    isGeneralGuidance: boolean;
    usedConversationHistory: number;
  };
  sources: AnswerSource[];
  retrievedChunks: number;
};

type MatchRow = {
  id: string;
  document_id: string;
  content: string;
  source_url: string | null;
  external_id: string | null;
  similarity: number | string;
  chunk_index: number | null;
  title: string;
  category: string;
  source: string;
};

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

function getAnswerMode(topSimilarity: number): AnswerMode {
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
  answerMode: AnswerMode;
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

function applyAnswerTrustLabel({
  answer,
  label,
  answerMode,
}: {
  answer: string;
  label: string;
  answerMode: AnswerMode;
}) {
  const trimmedAnswer = answer.trim();
  const knownLabelPattern =
    /^#{1,3}\s*(Internal Source Summary|Generated Draft|Troubleshooting Guidance|General Knowledge)\b/i;
  const body = trimmedAnswer.replace(knownLabelPattern, "").trim();

  const noSourceNotice =
    answerMode !== "internal_document_supported"
      ? "No approved internal source found. This is generated guidance, not an approved St. Mary's policy.\n\n"
      : "";
  const normalizedBody =
    noSourceNotice && body.startsWith("No approved internal source found.")
      ? body
      : `${noSourceNotice}${body}`;

  return `## ${label}\n\n${normalizedBody}`;
}

function getEscalationGuidance(question: string, answer: string): Escalation {
  const lowerQuestion = question.toLowerCase();
  const lowerAnswer = answer.toLowerCase();
  const combined = `${lowerQuestion} ${lowerAnswer}`;

  let team: string | null = null;
  let urgency: UrgencyLevel = "low";
  let recommendedNextStep: string | null = null;

  const isITIssue =
    combined.includes("printer") ||
    combined.includes("print") ||
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
    combined.includes("account locked") ||
    combined.includes("access denied") ||
    combined.includes("mapped drive") ||
    combined.includes("network drive") ||
    combined.includes("wifi") ||
    combined.includes("wi-fi") ||
    combined.includes("unifi") ||
    combined.includes("microsoft 365") ||
    combined.includes("office 365");

  const isHRPayrollIssue =
    combined.includes("payroll") ||
    combined.includes("paycheck") ||
    combined.includes("pto") ||
    combined.includes("timecard") ||
    combined.includes("benefits") ||
    combined.includes("paylocity") ||
    combined.includes("employee record");

  const isClinicalIssue =
    combined.includes("medication") ||
    combined.includes("clinical") ||
    combined.includes("resident care") ||
    combined.includes("patient") ||
    combined.includes("nursing") ||
    combined.includes("care plan") ||
    combined.includes("treatment") ||
    combined.includes("medical");

  const isDoorAccessOrSecuritySystem =
    combined.includes("door access") ||
    combined.includes("badge access") ||
    combined.includes("keypad") ||
    combined.includes("camera") ||
    combined.includes("unifi access") ||
    combined.includes("access control");

  const isPhysicalSecurityOrSafety =
    combined.includes("security incident") ||
    combined.includes("intruder") ||
    combined.includes("threat") ||
    combined.includes("violence") ||
    combined.includes("police");

  const isFacilitiesIssue =
    combined.includes("maintenance") ||
    combined.includes("hvac") ||
    combined.includes("water leak") ||
    combined.includes("plumbing") ||
    combined.includes("electrical") ||
    combined.includes("air conditioning") ||
    combined.includes("heat not working") ||
    combined.includes("broken toilet") ||
    combined.includes("ceiling leak");

  const isUrgentOrEmergency =
    combined.includes("urgent") ||
    combined.includes("emergency") ||
    combined.includes("unsafe") ||
    combined.includes("danger") ||
    combined.includes("fire") ||
    combined.includes("flood") ||
    combined.includes("injury") ||
    combined.includes("outage") ||
    combined.includes("cannot provide care") ||
    combined.includes("resident safety") ||
    combined.includes("security breach");

  if (isITIssue) {
    team = "IT Support";
    recommendedNextStep =
      "Contact IT Support with the affected user, device or system name, location, screenshot, and exact error message.";
  }

  if (isDoorAccessOrSecuritySystem) {
    team = "IT Support / Security";
    recommendedNextStep =
      "For door access, badge, keypad, camera, or UniFi Access issues, contact IT Support first and involve Security if it affects physical access or safety.";
  }

  if (isHRPayrollIssue) {
    team = "HR / Payroll";
    recommendedNextStep =
      "Escalate to HR or Payroll with the employee name, date, and specific payroll, Paylocity, PTO, benefits, or timecard concern.";
  }

  if (isClinicalIssue) {
    team = "Clinical Leadership";
    recommendedNextStep =
      "Escalate to nursing leadership or the appropriate clinical supervisor. Do not rely on AI for clinical decisions.";
    urgency = "medium";
  }

  if (isPhysicalSecurityOrSafety) {
    team = "Security / Leadership";
    recommendedNextStep =
      "Escalate immediately to Security and leadership for safety or security-related incidents.";
    urgency = "high";
  }

  if (isFacilitiesIssue && !isITIssue && !isDoorAccessOrSecuritySystem) {
    team = "Maintenance";
    recommendedNextStep =
      "Escalate to Maintenance with the location, room/unit, urgency, and photos if available.";
  }

  if (isUrgentOrEmergency) {
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

function isOnboardingChecklistRequest(question: string) {
  const lowerQuestion = question.toLowerCase();

  return (
    lowerQuestion.includes("onboarding checklist") ||
    lowerQuestion.includes("onboard") ||
    lowerQuestion.includes("new employee") ||
    lowerQuestion.includes("new hire") ||
    lowerQuestion.includes("orientation checklist")
  );
}

function isExecutiveSummaryRequest(question: string) {
  const lowerQuestion = question.toLowerCase();

  return (
    lowerQuestion.includes("executive summary") ||
    lowerQuestion.includes("leadership summary") ||
    lowerQuestion.includes("summarize for leadership") ||
    lowerQuestion.includes("summarize for the ceo") ||
    lowerQuestion.includes("summarize for the cfo") ||
    lowerQuestion.includes("board summary")
  );
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

async function loadConversationHistory(
  conversationId: string,
  question: string
) {
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

  return historyResult.rows.reverse() as StoredMessage[];
}

export async function answerQuestion({
  question,
  userEmail = null,
  conversationId = null,
  conversationHistory,
  limit = 7,
  category = null,
  audit = true,
}: AnswerQuestionInput): Promise<AnswerQuestionResult> {
  const history =
    conversationHistory ||
    (conversationId ? await loadConversationHistory(conversationId, question) : []);

  const embeddingResult = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });

  const questionEmbedding = embeddingResult.data[0].embedding;

  const matchesResult = await db.query(
    `
    select
      m.id,
      m.document_id,
      m.content,
      coalesce(m.source_url, d.source_url) as source_url,
      m.similarity,
      d.external_id,
      dc.chunk_index,
      d.title,
      d.category,
      d.source
    from match_document_chunks($1::vector, $2) m
    join documents d
      on d.id = m.document_id
    left join document_chunks dc
      on dc.id = m.id
    where
      d.is_active = true
      and ($3::text is null or d.category = $3)
    order by m.similarity desc
    `,
    [`[${questionEmbedding.join(",")}]`, limit, category]
  );

  const matches = matchesResult.rows as MatchRow[];
  const topSimilarity = Number(matches[0]?.similarity || 0);
  const answerMode = getAnswerMode(topSimilarity);
  const trainingMode = isTrainingOrOnboardingRequest(question);
  const documentationMode = isDocumentationAssistantRequest(question);
  const onboardingChecklistMode = isOnboardingChecklistRequest(question);
  const executiveSummaryMode = isExecutiveSummaryRequest(question);
  const itTroubleshootingMode = isITTroubleshootingRequest(question);
  const answerLabel = getAnswerLabel({
    answerMode,
    documentationMode,
    itTroubleshootingMode,
  });

  const context = matches
    .map((row, index) => {
      return `
Source ${index + 1}
Document: ${row.title}
Category: ${row.category}
Similarity: ${row.similarity}
URL: ${row.source_url || "No source URL available"}

${row.content}
      `.trim();
    })
    .join("\n\n-------------------\n\n");

  const answerResult = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are St. Mary's internal AI knowledge assistant and operational copilot.

Your job:
- Help staff solve operational, IT, SharePoint, CareTracker, SigmaCare, phone, printer, onboarding, and workflow issues.
- Use the conversation history to understand follow-up questions.
- If a user asks a short follow-up like "what about 2026", infer what they are referring to from the prior conversation.
- Prefer active St. Mary's internal documents when they clearly match the question.
- If retrieved documents are weak, mismatched, outdated, incomplete, or unrelated, say "No approved internal source found." before giving any generated guidance.
- Be transparent, but do NOT show numeric confidence scores.
- Do not invent St. Mary's policies.
- Do not invent operational policy details, required approvals, official steps, deadlines, penalties, benefits, or ownership rules.
- Do not provide medical advice or clinical decisions.
- If the user asks for official policy, only use internal documents. If not found, say you could not find an approved St. Mary's policy.
- If the user asks general operational/IT troubleshooting, you may use general knowledge when internal docs are missing or weak.
- If the user's question is ambiguous and history does not clarify it, ask 1-3 smart follow-up questions.
- If the user says your previous answer was wrong or inaccurate, acknowledge it, explain what may have happened, and ask a better clarifying question.
- Keep answers practical, step-by-step, and helpful.

Training and onboarding behavior:
- When the user asks operational or onboarding questions like:
  - "how do I"
  - "walk me through"
  - "setup"
  - "configure"
  - "install"
  - "onboard"
  - "create account"
- Prefer structured step-by-step responses.
- Use numbered lists when appropriate.
- Explain prerequisite systems, permissions, or approvals.
- Mention dependency order when systems rely on each other.
- Keep onboarding instructions concise and operational.
- When useful, separate the answer into:
  - Prerequisites
  - Steps
  - Troubleshooting
  - Escalation
- If the question is about onboarding a new employee, clearly organize the flow across systems such as Microsoft 365, groups, devices, SigmaCare, CareTracker, Paylocity, badges/access, and any other relevant systems from the available context.
- If the user asks for an onboarding checklist, produce a practical checklist grouped by timing or workstream, with checkbox-style items, owner placeholders, prerequisites, and escalation notes.

Executive summary behavior:
- When the user asks for an executive or leadership summary, write for CEO/CFO/HR/IT leadership.
- Start with 3-5 concise bullets under "Executive Summary".
- Include operational impact, risk, owner/department, and recommended next action when supported by the context.
- Keep it brief, decision-oriented, and suitable for forwarding.

IT troubleshooting behavior:
- For troubleshooting requests, provide a clear diagnostic flow.
- Use sections like "Quick Checks", "Likely Causes", "Step-by-Step", "What to Capture", and "Escalation".
- For IT-owned systems such as CareTracker, SigmaCare, Microsoft 365, SharePoint, Teams, Outlook, UniFi, printers, copiers, scanners, passwords, network drives, and devices, route escalation to IT Support.


Documentation assistant behavior:
- Help create professional operational documentation.
- Examples include:
  - SOPs
  - onboarding checklists
  - incident reports
  - troubleshooting guides
  - email templates
  - request forms
  - operational procedures
- Prefer clean formatting with sections and headings.
- Use concise enterprise/professional wording.
- Keep outputs practical and realistic for internal operations.
- When drafting documentation, avoid inventing St. Mary's official policy details.
- If internal documents support the draft, use them as the base.
- If the user is asking for a draft or template, make it editable and ready to copy.
- When helpful, include placeholders like [Name], [Date], [Department], [System], or [Issue].

Escalation behavior:
- If an issue likely requires human intervention, clearly recommend who should handle it.
- St. Mary's ownership rules matter more than generic assumptions.
- Printer, copier, scanner, Outlook, SharePoint, Microsoft 365, Teams, password, login, voicemail, CareTracker, SigmaCare, network drive, and device issues should go to IT Support.
- Door access, keypad, camera, UniFi Access, and badge issues should usually start with IT Support and may involve Security if physical access or safety is impacted.
- HR, payroll, PTO, Paylocity, timecard, or benefits issues should go to HR / Payroll.
- Clinical workflow, medication, resident care, or patient-care issues should go to Nursing Leadership or the clinical supervisor.
- Building, HVAC, plumbing, electrical, water leak, and facilities issues should go to Maintenance.
- If the issue sounds urgent, unsafe, or emergency-related, clearly say it should be escalated immediately.
- When appropriate, include a short "Escalation" section with the likely team and next step.

How to phrase verification:
- Start every answer with exactly one of these markdown headings based on the answer type:
  - ## Internal Source Summary
  - ## Generated Draft
  - ## Troubleshooting Guidance
  - ## General Knowledge
- For this answer, use this heading exactly: ## ${answerLabel}
- If answer mode is general_guidance or no useful internal source exists, immediately follow the heading with: "No approved internal source found. This is generated guidance, not an approved St. Mary's policy."
- When answering from internal knowledge, summarize only what the retrieved active internal source supports. Do not fill gaps with invented operational details.
- When internal documents clearly support the answer, start naturally with: "Based on the St. Mary's document I found..."
- When documents are only possibly related, say: "I found a possible related St. Mary's document, but this may need verification..."
- When no useful internal document is found, say: "No approved internal source found."
- If the answer is general guidance, avoid presenting it as St. Mary's official procedure.
- When using internal context, cite the document naturally with labels like [Source 1] or the document title.
- Do not invent citations. Only cite sources shown in the retrieved active internal knowledge.
- Do not mention similarity scores, thresholds, embeddings, retrieval, or vector search to the user.
        `.trim(),
      },
      ...toOpenAIMessages(history),
      {
        role: "user",
        content: `
Current question:
${question}

Answer mode:
${answerMode}

Training/onboarding mode:
${trainingMode ? "true" : "false"}

Documentation assistant mode:
${documentationMode ? "true" : "false"}

Onboarding checklist mode:
${onboardingChecklistMode ? "true" : "false"}

Executive summary mode:
${executiveSummaryMode ? "true" : "false"}

IT troubleshooting mode:
${itTroubleshootingMode ? "true" : "false"}

Required answer label:
${answerLabel}

Retrieved active internal knowledge:
${context || "No active internal context found."}
        `.trim(),
      },
    ],
    temperature: 0.35,
  });

  const rawAnswer =
    answerResult.choices[0]?.message?.content ||
    "I could not generate an answer.";
  const answer = applyAnswerTrustLabel({
    answer: rawAnswer,
    label: answerLabel,
    answerMode,
  });

  const escalation = getEscalationGuidance(question, answer);

  if (audit) {
    await db.query(
      `
      insert into audit_logs
      (user_email, question, answer, retrieved_sources)
      values ($1, $2, $3, $4)
      `,
      [userEmail || null, question, answer, JSON.stringify(matches)]
    );
  }

  return {
    answer,
    trainingMode,
    documentationMode,
    escalation,
    verification: {
      answerMode,
      usedInternalDocuments: answerMode === "internal_document_supported",
      isGeneralGuidance: answerMode === "general_guidance",
      usedConversationHistory: history.length,
    },
    sources: matches.map((row) => ({
      id: row.id,
      documentId: row.document_id,
      title: row.title,
      category: row.category,
      source: row.source,
      sourceUrl: row.source_url,
      externalId: row.external_id,
      similarity: row.similarity,
      chunkIndex: row.chunk_index,
    })),
    retrievedChunks: matches.length,
  };
}
