import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { openai } from "@/lib/openai";

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

function getEscalationGuidance(question: string, answer: string) {
  const lowerQuestion = question.toLowerCase();
  const lowerAnswer = answer.toLowerCase();
  const combined = `${lowerQuestion} ${lowerAnswer}`;

  let team: string | null = null;
  let urgency: UrgencyLevel = "low";
  let recommendedNextStep: string | null = null;

  if (
    combined.includes("printer") ||
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
    team = "Security / Facilities";
    recommendedNextStep =
      "Escalate to Security, Facilities, or IT depending on whether this is physical access, building equipment, or system access.";
  }

  if (
    combined.includes("maintenance") ||
    combined.includes("hvac") ||
    combined.includes("water leak") ||
    combined.includes("plumbing") ||
    combined.includes("electrical")
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
    combined.includes("down") ||
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, userEmail, conversationId } = body;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { success: false, error: "question is required" },
        { status: 400 }
      );
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
      input: question,
    });

    const questionEmbedding = embeddingResult.data[0].embedding;

    const matches = await db.query(
      `
      select
        m.id,
        m.document_id,
        m.content,
        m.source_url,
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
    const answerMode = getAnswerMode(topSimilarity);
    const trainingMode = isTrainingOrOnboardingRequest(question);

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
- If retrieved documents are weak, mismatched, outdated, incomplete, or unrelated, use general IT/troubleshooting knowledge when appropriate.
- Be transparent, but do NOT show numeric confidence scores.
- Do not invent St. Mary's policies.
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

Escalation behavior:
- If an issue likely requires human intervention, clearly recommend who should handle it.
- IT issues should usually go to IT Support.
- HR, payroll, PTO, timecard, or benefits issues should go to HR / Payroll.
- Clinical workflow, medication, resident care, or patient-care issues should go to Nursing Leadership or the clinical supervisor.
- Facility, building, physical equipment, door, alarm, camera, badge, or keypad issues should go to Maintenance, Security, Facilities, or IT depending on the issue.
- If the issue sounds urgent, unsafe, or emergency-related, clearly say it should be escalated immediately.
- When appropriate, include a short "Escalation" section with the likely team and next step.

How to phrase verification:
- When internal documents clearly support the answer, start naturally with: "Based on the St. Mary's document I found..."
- When documents are only possibly related, say: "I found a possible related St. Mary's document, but this may need verification..."
- When no useful internal document is found, say: "I may not have found the exact St. Mary's document for this, but generally..."
- If the answer is general guidance, avoid presenting it as St. Mary's official procedure.
- Do not mention similarity scores, thresholds, embeddings, retrieval, or vector search to the user.
          `.trim(),
        },
        ...toOpenAIMessages(conversationHistory),
        {
          role: "user",
          content: `
Current question:
${question}

Answer mode:
${answerMode}

Training/onboarding mode:
${trainingMode ? "true" : "false"}

Retrieved active internal knowledge:
${context || "No active internal context found."}
          `.trim(),
        },
      ],
      temperature: 0.35,
    });

    const answer =
      answerResult.choices[0]?.message?.content ||
      "I could not generate an answer.";

    const escalation = getEscalationGuidance(question, answer);

    await db.query(
      `
      insert into audit_logs
      (user_email, question, answer, retrieved_sources)
      values ($1, $2, $3, $4)
      `,
      [userEmail || null, question, answer, JSON.stringify(matches.rows)]
    );

    return NextResponse.json({
      success: true,
      trainingMode,
      answer,
      escalation,
      verification: {
        answerMode,
        usedInternalDocuments:
          answerMode === "internal_document_supported" ||
          answerMode === "possible_internal_match",
        isGeneralGuidance: answerMode === "general_guidance",
        usedConversationHistory: conversationHistory.length,
      },
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
  } catch (error: any) {
    console.error("CHAT_ERROR:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
