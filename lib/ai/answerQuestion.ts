import { db } from "@/lib/db";
import { openai } from "@/lib/openai";

export type ChatRole = "user" | "assistant";
export type StoredMessage = { role: ChatRole; content: string; };
export type UrgencyLevel = "low" | "medium" | "high";
export type AnswerMode = "internal_document_supported" | "possible_internal_match" | "general_guidance";

export type AnswerSource = {
  id: string; documentId: string; title: string; category: string;
  source: string; sourceUrl: string | null; externalId: string | null;
  similarity: number | string; chunkIndex: number | null;
};

export type Escalation = {
  team: string | null; urgency: UrgencyLevel;
  recommendedNextStep: string | null; shouldEscalate: boolean;
};

export type AnswerQuestionInput = {
  question: string; userEmail?: string | null; conversationId?: string | null;
  conversationHistory?: StoredMessage[]; limit?: number;
  category?: string | null; audit?: boolean;
};

export type AnswerQuestionResult = {
  answer: string; trainingMode: boolean; documentationMode: boolean;
  escalation: Escalation;
  verification: { answerMode: AnswerMode; usedInternalDocuments: boolean; isGeneralGuidance: boolean; usedConversationHistory: number; };
  sources: AnswerSource[]; retrievedChunks: number;
};

type MatchRow = {
  id: string; document_id: string; content: string; source_url: string | null;
  external_id: string | null; similarity: number | string; chunk_index: number | null;
  title: string; category: string; source: string;
};

type TitleMatchRow = {
  id: string; title: string; category: string; source: string;
  source_url: string | null; external_id: string | null; chunks: number;
};

function toOpenAIMessages(messages: StoredMessage[]) {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content?.trim())
    .map((m) => ({ role: m.role, content: m.content }));
}

function getAnswerMode(topSimilarity: number): AnswerMode {
  if (topSimilarity >= 0.62) return "internal_document_supported";
  if (topSimilarity >= 0.48) return "possible_internal_match";
  return "general_guidance";
}

function getAnswerLabel({ answerMode, documentationMode, itTroubleshootingMode }: {
  answerMode: AnswerMode; documentationMode: boolean; itTroubleshootingMode: boolean;
}) {
  if (documentationMode) return "Generated Draft";
  if (itTroubleshootingMode) return "Troubleshooting Guidance";
  if (answerMode === "internal_document_supported") return "Internal Source Summary";
  return "General Knowledge";
}

const SECTION_LABEL_SET = new Set([
  "purpose", "overview", "summary", "background",
  "retention period", "retention periods",
  "records covered", "covered records",
  "additional records", "other records",
  "source note", "source", "notes", "note",
  "destruction of records", "destruction",
  "review and updates", "review and update",
  "escalation", "next steps", "next step",
  "quick checks", "likely causes",
  "what to capture", "prerequisites", "steps",
  "troubleshooting", "requirements", "details",
  "key details", "key points", "highlights",
  "records", "documents",
]);

function stripBold(s: string): string {
  return s.replace(/^\*\*(.+?)\*\*:?$/, "$1").trim();
}

function isSectionLabel(raw: string): boolean {
  const t = stripBold(raw.trim()).replace(/:$/, "").trim();
  if (!t || t.length > 60) return false;
  if (!SECTION_LABEL_SET.has(t.toLowerCase())) return false;
  if (/[.!?]/.test(t)) return false;
  return true;
}

function isListCandidate(raw: string | undefined): boolean {
  if (!raw) return false;
  const t = raw.trim();
  if (!t || t.length > 140) return false;
  if (/^[#\-*>|]/.test(t)) return false;
  if (/^\d+[.)]\s/.test(t)) return false;
  if (t.endsWith(":")) return false;
  if (isSectionLabel(t)) return false;
  if (t.split(" ").length > 20) return false;
  return true;
}

function enforceMarkdownFormatting(text: string): string {
  // Step 1: Convert known section labels to ## headings using direct regex
  const HEADING_PATTERN = /^(\*\*)?(Purpose|Retention Periods?|Records Covered|Covered Records|Additional Records|Other Records|Source Note|Destruction of Records|Review and Updates?|Escalation|Next Steps?|Quick Checks|Likely Causes|What to Capture|Prerequisites|Steps|Troubleshooting|Requirements|Key Details|Key Points|Highlights|Overview|Summary|Background|Notes?|Documents?|Records?)(\.?\*\*)?\s*:?\s*$/gm;
  let result = text.replace(HEADING_PATTERN, (_match, _b1, label, _b2) => "\n## " + label.trim() + "\n");

  // Step 2: Convert runs of 2+ plain short lines to bullet lists
  const lines = result.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();
    if (isListCandidate(t) && isListCandidate(lines[i + 1]?.trim())) {
      while (i < lines.length && isListCandidate(lines[i]?.trim())) {
        out.push("- " + lines[i].trim());
        i++;
      }
      continue;
    }
    out.push(raw);
    i++;
  }
  return out.join("\n");
}

function applyAnswerTrustLabel({ answer, label, answerMode }: {
  answer: string; label: string; answerMode: AnswerMode;
}) {
  const trimmedAnswer = answer.trim();
  const knownLabelPattern = /^#{1,3}\s*(Internal Source Summary|Generated Draft|Troubleshooting Guidance|General Knowledge)\b/i;
  const body = trimmedAnswer.replace(knownLabelPattern, "").trim();
  const noSourceNotice = answerMode !== "internal_document_supported"
    ? "No approved internal source found. This is generated guidance, not an approved St. Mary's policy.\n\n"
    : "";
  const normalizedBody = noSourceNotice && body.startsWith("No approved internal source found.")
    ? body : noSourceNotice + body;
  return "## " + label + "\n\n" + normalizedBody;
}

function getEscalationGuidance(question: string, answer: string): Escalation {
  // Only use the question for escalation detection — not the answer body.
  // This prevents false positives where the answer mentions HR/payroll/medical
  // in a purely informational context (e.g. "what is the retention policy?")
  const lowerQuestion = question.toLowerCase();
  const combined = lowerQuestion;

  // Knowledge-lookup questions should never trigger escalation
  const isKnowledgeLookup =
    lowerQuestion.includes("what is") || lowerQuestion.includes("what are") ||
    lowerQuestion.includes("what does") || lowerQuestion.includes("tell me about") ||
    lowerQuestion.includes("explain") || lowerQuestion.includes("describe") ||
    lowerQuestion.includes("define") || lowerQuestion.includes("show me") ||
    lowerQuestion.includes("what's") || lowerQuestion.includes("how long") ||
    (lowerQuestion.includes("policy") && !lowerQuestion.includes("violat")) ||
    (lowerQuestion.includes("retention") && !lowerQuestion.includes("issue")) ||
    (lowerQuestion.includes("procedure") && !lowerQuestion.includes("broken"));

  let team: string | null = null;
  let urgency: UrgencyLevel = "low";
  let recommendedNextStep: string | null = null;

  if (isKnowledgeLookup) {
    return { team: null, urgency: "low", recommendedNextStep: null, shouldEscalate: false };
  }

  const isIT = combined.includes("printer") || combined.includes("copier") || combined.includes("scanner") || combined.includes("outlook") || combined.includes("sharepoint") || combined.includes("password") || combined.includes("voicemail") || combined.includes("computer") || combined.includes("laptop") || combined.includes("teams") || combined.includes("caretracker") || combined.includes("sigmacare") || combined.includes("login") || combined.includes("account locked") || combined.includes("access denied") || combined.includes("mapped drive") || combined.includes("network drive") || combined.includes("wifi") || combined.includes("unifi") || combined.includes("microsoft 365") || combined.includes("office 365") || combined.includes("not working") || combined.includes("can't log") || combined.includes("cannot log");
  const isHR = combined.includes("payroll issue") || combined.includes("paycheck") || combined.includes("pto request") || combined.includes("timecard") || combined.includes("paylocity") || combined.includes("missing pay") || combined.includes("wrong pay");
  const isClinical = combined.includes("medication error") || combined.includes("clinical incident") || combined.includes("resident fell") || combined.includes("patient incident") || combined.includes("care plan issue") || combined.includes("treatment error");
  const isDoorAccess = combined.includes("door access") || combined.includes("badge access") || combined.includes("keypad") || combined.includes("unifi access") || combined.includes("access control") || combined.includes("badge not working") || combined.includes("locked out");
  const isPhysicalSecurity = combined.includes("security incident") || combined.includes("intruder") || combined.includes("threat") || combined.includes("violence") || combined.includes("police");
  const isFacilities = lowerQuestion.includes("maintenance request") || lowerQuestion.includes("hvac") || lowerQuestion.includes("water leak") || lowerQuestion.includes("plumbing") || lowerQuestion.includes("electrical") || lowerQuestion.includes("air conditioning") || lowerQuestion.includes("broken toilet") || lowerQuestion.includes("ceiling leak");
  const isUrgent = combined.includes("urgent") || combined.includes("emergency") || combined.includes("unsafe") || combined.includes("danger") || combined.includes("fire") || combined.includes("flood") || combined.includes("injury") || combined.includes("outage") || combined.includes("cannot provide care") || combined.includes("resident safety") || combined.includes("security breach");

  if (isIT) { team = "IT Support"; recommendedNextStep = "Contact IT Support with the affected user, device or system name, location, screenshot, and exact error message."; }
  if (isDoorAccess) { team = "IT Support / Security"; recommendedNextStep = "For door access, badge, keypad, camera, or UniFi Access issues, contact IT Support first and involve Security if it affects physical access or safety."; }
  if (isHR) { team = "HR / Payroll"; recommendedNextStep = "Escalate to HR or Payroll with the employee name, date, and specific payroll, Paylocity, PTO, benefits, or timecard concern."; }
  if (isClinical) { team = "Clinical Leadership"; recommendedNextStep = "Escalate to nursing leadership or the appropriate clinical supervisor. Do not rely on AI for clinical decisions."; urgency = "medium"; }
  if (isPhysicalSecurity) { team = "Security / Leadership"; recommendedNextStep = "Escalate immediately to Security and leadership for safety or security-related incidents."; urgency = "high"; }
  if (isFacilities && !isIT && !isDoorAccess) { team = "Maintenance"; recommendedNextStep = "Escalate to Maintenance with the location, room/unit, urgency, and photos if available."; }
  if (isUrgent) urgency = "high";
  if (!team && urgency === "high") { team = "Leadership / Supervisor"; recommendedNextStep = "Escalate immediately to the appropriate supervisor or leadership contact for the area involved."; }

  return { team, urgency, recommendedNextStep, shouldEscalate: Boolean(team) };
}

function isTrainingOrOnboardingRequest(q: string) {
  const l = q.toLowerCase();
  return l.includes("how do i") || l.includes("walk me through") || l.includes("setup") || l.includes("set up") || l.includes("configure") || l.includes("onboard") || l.includes("install") || l.includes("create account") || l.includes("training") || l.includes("show me how") || l.includes("steps") || l.includes("procedure") || l.includes("process");
}

function isDocumentationAssistantRequest(q: string) {
  const l = q.toLowerCase();
  return l.includes("write") || l.includes("draft") || l.includes("create a form") || l.includes("create an sop") || l.includes("generate") || l.includes("incident report") || l.includes("checklist") || l.includes("template") || l.includes("documentation") || l.includes("document this") || l.includes("make a policy") || l.includes("make an sop") || l.includes("request form") || l.includes("troubleshooting guide") || l.includes("professional email");
}

function isOnboardingChecklistRequest(q: string) {
  const l = q.toLowerCase();
  return l.includes("onboarding checklist") || l.includes("onboard") || l.includes("new employee") || l.includes("new hire") || l.includes("orientation checklist");
}

function isExecutiveSummaryRequest(q: string) {
  const l = q.toLowerCase();
  return l.includes("executive summary") || l.includes("leadership summary") || l.includes("summarize for leadership") || l.includes("summarize for the ceo") || l.includes("summarize for the cfo") || l.includes("board summary");
}

function isITTroubleshootingRequest(q: string) {
  const l = q.toLowerCase();
  return l.includes("troubleshoot") || l.includes("not working") || l.includes("error") || l.includes("cannot access") || l.includes("printer") || l.includes("copier") || l.includes("scanner") || l.includes("outlook") || l.includes("teams") || l.includes("sharepoint") || l.includes("caretracker") || l.includes("sigmacare") || l.includes("unifi") || l.includes("password");
}

function getTitleSearchTerms(question: string) {
  const stopWords = new Set(["a","an","and","are","do","does","for","have","is","it","of","our","policy","the","to","we","what","where"]);
  return question.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).map(t => t.trim()).filter(t => t.length >= 4 && !stopWords.has(t)).slice(0, 5);
}

function hasRetrievedTitleMatch(question: string, matches: { title: string }[]) {
  const terms = getTitleSearchTerms(question);
  if (terms.length === 0) return false;
  return matches.some(m => terms.some(t => m.title.toLowerCase().includes(t)));
}

async function findActiveTitleMatches(question: string) {
  const terms = getTitleSearchTerms(question);
  if (terms.length === 0) return [] as TitleMatchRow[];
  const result = await db.query(
    `select d.id, d.title, d.category, d.source, d.source_url, d.external_id, count(dc.id)::int as chunks
     from documents d left join document_chunks dc on dc.document_id = d.id
     where d.is_active = true and (${terms.map((_, i) => `d.title ilike $${i + 1}`).join(" or ")})
     group by d.id order by count(dc.id) desc, d.created_at desc limit 5`,
    terms.map(t => `%${t}%`)
  );
  return result.rows as TitleMatchRow[];
}

async function loadConversationHistory(conversationId: string, question: string) {
  const result = await db.query(
    `select role, content from messages where conversation_id = $1 and not (role = 'user' and content = $2) order by created_at desc limit 12`,
    [conversationId, question]
  );
  return result.rows.reverse() as StoredMessage[];
}

export async function answerQuestion({
  question, userEmail = null, conversationId = null, conversationHistory,
  limit = 7, category = null, audit = true,
}: AnswerQuestionInput): Promise<AnswerQuestionResult> {
  const history = conversationHistory || (conversationId ? await loadConversationHistory(conversationId, question) : []);

  const embeddingResult = await openai.embeddings.create({ model: "text-embedding-3-small", input: question });
  const questionEmbedding = embeddingResult.data[0].embedding;

  const matchesResult = await db.query(
    `select m.id, m.document_id, m.content, coalesce(m.source_url, d.source_url) as source_url, m.similarity, d.external_id, dc.chunk_index, d.title, d.category, d.source
     from match_document_chunks($1::vector, $2) m join documents d on d.id = m.document_id left join document_chunks dc on dc.id = m.id
     where d.is_active = true and ($3::text is null or d.category = $3) order by m.similarity desc`,
    [`[${questionEmbedding.join(",")}]`, limit, category]
  );

  const matches = matchesResult.rows as MatchRow[];
  const topSimilarity = Number(matches[0]?.similarity || 0);
  let answerMode = getAnswerMode(topSimilarity);
  const trainingMode = isTrainingOrOnboardingRequest(question);
  const documentationMode = isDocumentationAssistantRequest(question);
  const onboardingChecklistMode = isOnboardingChecklistRequest(question);
  const executiveSummaryMode = isExecutiveSummaryRequest(question);
  const itTroubleshootingMode = isITTroubleshootingRequest(question);

  const titleMatches = answerMode !== "internal_document_supported" ? await findActiveTitleMatches(question) : [];
  const titleMatchesWithoutChunks = titleMatches.filter(d => Number(d.chunks || 0) === 0);
  const titleMatchesWithChunks = titleMatches.filter(d => Number(d.chunks || 0) > 0);

  if (titleMatchesWithoutChunks.length > 0 && matches.length === 0) {
    const listedDocuments = titleMatchesWithoutChunks.map(d => {
      const sourceLabel = [d.category, d.source].filter(Boolean).join(" - ");
      return `- **${d.title}**${sourceLabel ? "\n  " + sourceLabel : ""}`;
    }).join("\n");

    const answer = `## Internal Source Summary\n\nI found matching St. Mary's document records, but they are not fully readable by the AI yet.\n\nThese records exist in the Knowledge Library, but they do not currently have searchable text chunks. I cannot summarize or quote them until they are reindexed.\n\nFound documents:\n${listedDocuments}\n\nNext step:\n\n1. Open Sync Admin.\n2. Queue unreadable documents for reindexing.\n3. Process the sync queue.\n4. Ask again after chunks are created.`;

    const sources = titleMatchesWithoutChunks.map(d => ({ id: `document:${d.id}`, documentId: d.id, title: d.title, category: d.category, source: d.source, sourceUrl: d.source_url, externalId: d.external_id, similarity: 1, chunkIndex: null }));

    if (audit) await db.query(`insert into audit_logs (user_email, question, answer, retrieved_sources) values ($1, $2, $3, $4)`, [userEmail || null, question, answer, JSON.stringify(sources)]);

    return { answer, trainingMode, documentationMode, escalation: { team: null, urgency: "low", recommendedNextStep: null, shouldEscalate: false }, verification: { answerMode: "possible_internal_match", usedInternalDocuments: false, isGeneralGuidance: false, usedConversationHistory: history.length }, sources, retrievedChunks: 0 };
  }

  if (answerMode !== "internal_document_supported" && topSimilarity >= 0.45 && (titleMatchesWithChunks.length > 0 || hasRetrievedTitleMatch(question, matches))) {
    answerMode = "internal_document_supported";
  }

  const answerLabel = getAnswerLabel({ answerMode, documentationMode, itTroubleshootingMode });

  const context = matches.map((row, idx) =>
    `Source ${idx + 1}\nDocument: ${row.title}\nCategory: ${row.category}\nSimilarity: ${row.similarity}\nURL: ${row.source_url || "No source URL available"}\n\n${row.content}`.trim()
  ).join("\n\n-------------------\n\n");

  const SYSTEM_PROMPT = `You are St. Mary's internal AI knowledge assistant and operational copilot.

Your job:
- Help staff solve operational, IT, SharePoint, CareTracker, SigmaCare, phone, printer, onboarding, and workflow issues.
- Use the conversation history to understand follow-up questions.
- Prefer active St. Mary's internal documents when they clearly match the question.
- If retrieved documents are weak or unrelated, say "No approved internal source found." before giving guidance.
- Do not invent St. Mary's policies or operational details.
- Do not provide medical advice or clinical decisions.
- Keep answers practical, step-by-step, and helpful.

FORMATTING - follow exactly every response:
- Use ### for ALL section headings. Examples: ### Purpose, ### Retention Period, ### Records Covered.
- Use - bullet points for EVERY list. NEVER write list items as plain newlines without a dash prefix.
- Use **bold** for key terms and field names.
- Use numbered lists (1. 2. 3.) for sequential steps only.
- Leave a blank line before every heading.
- Group related list items into one bullet with commas instead of separate lines.

For policy summaries use this exact structure:
One short intro sentence.
### Purpose
### Retention Period
### Records Covered - 3-5 grouped bullet points
### Additional Records - bullet points when applicable
### Source Note

For training/onboarding requests: numbered steps, Prerequisites/Steps/Troubleshooting/Escalation sections.
For IT troubleshooting: Quick Checks, Likely Causes, Step-by-Step, What to Capture, Escalation sections.
For executive summaries: 3-5 concise bullets for CEO/CFO/HR/IT leadership.
For documentation: clean sections, professional wording, placeholders like [Name], [Date], [Department].
For email drafts: end at the final sentence. Do NOT add any signature block, sign-off, [Your Name], [Your Position], [Your Title], or St. Mary's name at the bottom. Staff email signatures are handled automatically by Outlook.

Escalation routing:
- IT issues to IT Support. Door/badge/camera to IT Support / Security. HR/payroll/PTO to HR / Payroll.
- Clinical/nursing to Clinical Leadership. Facilities/HVAC/plumbing to Maintenance.

Start every answer with: ## ${answerLabel}
If answerMode is general_guidance: follow with "No approved internal source found. This is generated guidance, not an approved St. Mary's policy."
When internal documents support the answer, start with "Based on the St. Mary's document I found..."
Do not mention similarity scores, embeddings, or vector search.`;

  const USER_PROMPT = `Current question: ${question}

Answer mode: ${answerMode}
Required label: ## ${answerLabel}
Training mode: ${trainingMode} | Documentation mode: ${documentationMode} | IT troubleshooting mode: ${itTroubleshootingMode}
Executive summary mode: ${executiveSummaryMode} | Onboarding checklist mode: ${onboardingChecklistMode}

Retrieved internal knowledge:
${context || "No active internal context found."}`;

  const answerResult = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...toOpenAIMessages(history),
      { role: "user", content: USER_PROMPT },
    ],
    temperature: 0.35,
  });

  const rawAnswer = enforceMarkdownFormatting(answerResult.choices[0]?.message?.content || "I could not generate an answer.");
  const answer = applyAnswerTrustLabel({ answer: rawAnswer, label: answerLabel, answerMode });
  const escalation = getEscalationGuidance(question, answer);

  if (audit) await db.query(`insert into audit_logs (user_email, question, answer, retrieved_sources) values ($1, $2, $3, $4)`, [userEmail || null, question, answer, JSON.stringify(matches)]);

  return {
    answer, trainingMode, documentationMode, escalation,
    verification: { answerMode, usedInternalDocuments: answerMode === "internal_document_supported", isGeneralGuidance: answerMode === "general_guidance", usedConversationHistory: history.length },
    sources: matches.map(row => ({ id: row.id, documentId: row.document_id, title: row.title, category: row.category, source: row.source, sourceUrl: row.source_url, externalId: row.external_id, similarity: row.similarity, chunkIndex: row.chunk_index })),
    retrievedChunks: matches.length,
  };
}
