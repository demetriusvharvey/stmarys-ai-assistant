import { NextResponse } from "next/server";
import { AgentRouter } from "@/lib/agents/AgentRouter";
import { resolveUserRoles } from "@/lib/agents/resolveUserRoles";
import type { AgentIdentity } from "@/lib/agents/types";
import { writeAuditLog } from "@/lib/audit";
import { deIdentifyText } from "@/lib/phi/deidentify";

export const runtime = "nodejs";
export const maxDuration = 300;

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = body.question;
    const identity = (body.identity || null) as AgentIdentity | null;

    if (!question || typeof question !== "string") {
      return NextResponse.json({ success: false, error: "question is required" }, { status: 400 });
    }

    const { cleanText: sanitizedQuestion, findings: phiFindings } = deIdentifyText(question);
    const phiDetected = phiFindings.length > 0;
    const phiRedactedCount = phiFindings.reduce((sum, f) => sum + f.count, 0);

    const resolvedRoles = resolveUserRoles(identity);
    const router = new AgentRouter();
    const decision = router.route({
      question: sanitizedQuestion,
      userEmail: identity?.email || null,
      conversationId: identity?.conversationId || null,
      channel: identity?.channel || "mcp",
    });

    const agent = router.getAgent(decision);
    if (!agent) {
      return NextResponse.json({ success: false, error: "No agent available" }, { status: 500 });
    }

    const agentResponse = await agent.answer({
      question: sanitizedQuestion,
      user: {
        identity,
        email: identity?.email || null,
        displayName: identity?.displayName || null,
        tenantId: identity?.tenantId || null,
      },
      resolvedRoles: resolvedRoles.roles,
      channel: identity?.channel || "mcp",
      tenantValidated: resolvedRoles.tenantValidated,
      routeDecision: decision,
      userEmail: identity?.email || null,
      conversationId: identity?.conversationId || null,
    });

    await writeAuditLog({
      userEmail: identity?.email || null,
      action: "agent_answer",
      route: "/api/ai-tools/answer-question",
      metadata: {
        channel: identity?.channel || "unknown",
        selectedAgent: decision.agent,
        routeConfidence: decision.confidence,
        routeReason: decision.reason,
        matchedKeywords: decision.matchedKeywords,
        resolvedRoles: resolvedRoles.roles,
        answerMode: agentResponse.auditMetadata?.answerMode ?? "unknown",
      },
    });

    const agentMeta = {
      name: decision.agent,
      ...(AGENT_DISPLAY[decision.agent] ?? { displayName: "Knowledge Agent", icon: "🔍" }),
      reason: decision.reason,
    };

    return NextResponse.json({
      success: true,
      question,
      answer: agentResponse.answer,
      selectedAgent: agentMeta,
      sources: agentResponse.sources.map((s) => ({
        chunkId: s.id,
        documentId: s.documentId,
        title: s.title,
        category: s.category,
        source: s.source,
        sourceUrl: s.sourceUrl,
        similarity: Number(s.similarity ?? 0),
      })),
      workflow: agentResponse.workflow ?? null,
      phiWarning: phiDetected ? { detected: true, redactedCount: phiRedactedCount } : null,
    });
  } catch (error: any) {
    console.error("[answer-question] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed" }, { status: 500 });
  }
}
