import { NextRequest, NextResponse } from "next/server";
import { AgentRouter } from "@/lib/agents/AgentRouter";
import { deIdentifyText } from "@/lib/phi/deidentify";
import { db } from "@/lib/db";
import { checkRateLimit, rateLimitKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, userEmail, conversationId } = body;

    if (!question || typeof question !== "string") {
      return NextResponse.json({ success: false, error: "question is required" }, { status: 400 });
    }

    // Rate limit: 30 requests per minute per user
    const rl = checkRateLimit(rateLimitKey(req, userEmail), 30, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: `Too many requests. Please wait ${Math.ceil(rl.retryAfterMs / 1000)} seconds.` },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const { cleanText: sanitizedQuestion, findings: phiFindings } = deIdentifyText(question);
    const phiDetected = phiFindings.length > 0;
    const phiRedactedCount = phiFindings.reduce((sum, f) => sum + f.count, 0);

    // Load conversation history
    let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
    if (conversationId) {
      const historyResult = await db.query(
        `select role, content from messages
         where conversation_id = $1 and not (role = 'user' and content = $2)
         order by created_at desc limit 12`,
        [conversationId, question]
      );
      conversationHistory = historyResult.rows.reverse();
    }

    const router = new AgentRouter();
    const decision = router.route({ question: sanitizedQuestion, userEmail, conversationId, channel: "web" });
    const agent = router.getAgent(decision);

    if (!agent) {
      return NextResponse.json({ success: false, error: "No agent available" }, { status: 500 });
    }

    const agentResponse = await agent.answer({
      question: sanitizedQuestion,
      user: { email: userEmail ?? null },
      resolvedRoles: ["staff"],
      channel: "web",
      tenantValidated: false,
      routeDecision: decision,
      userEmail: userEmail ?? null,
      conversationId: conversationId ?? null,
      conversationHistory,
    });

    // Audit log
    await db.query(
      `insert into audit_logs (user_email, question, answer, retrieved_sources) values ($1, $2, $3, $4)`,
      [userEmail ?? null, sanitizedQuestion, agentResponse.answer, JSON.stringify(agentResponse.sources)]
    ).catch(() => {});

    // Knowledge gap tracking — log when no internal source was found (deduplicated per 24h)
    const answerMode = (agentResponse.auditMetadata?.answerMode as string) ?? "general_guidance";
    if (answerMode === "general_guidance") {
      db.query(
        `INSERT INTO knowledge_gaps (question, user_email, agent, flagged_at, status)
         SELECT $1, $2, $3, now(), 'open'
         WHERE NOT EXISTS (
           SELECT 1 FROM knowledge_gaps WHERE question = $1 AND flagged_at > now() - interval '24 hours'
         )`,
        [sanitizedQuestion, userEmail ?? null, decision.agent]
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
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
        answerMode: answerMode,
        usedInternalDocuments: answerMode === "internal_document_supported",
        isGeneralGuidance: answerMode === "general_guidance",
        usedConversationHistory: conversationHistory.length,
      },
      selectedAgent: { name: decision.agent, reason: decision.reason },
      sources: agentResponse.sources,
      phiWarning: phiDetected ? { detected: true, redactedCount: phiRedactedCount } : null,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
