import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/ai/answerQuestion";
import { AgentRouter } from "@/lib/agents/AgentRouter";
import { resolveUserRoles } from "@/lib/agents/resolveUserRoles";
import type { AgentIdentity, AgentResponse } from "@/lib/agents/types";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const question = body.question;
    const limit = Number(body.limit || 7);
    const category = body.category || null;
    const identity = (body.identity || null) as AgentIdentity | null;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { success: false, error: "question is required" },
        { status: 400 }
      );
    }

    const resolvedRoles = resolveUserRoles(identity);
    const router = new AgentRouter();
    const routeDecision = router.route({
      question,
      userEmail: identity?.email || null,
      conversationId: identity?.conversationId || null,
    });
    const permissionDecision = {
      allowed: true,
      reason: "observe_only_no_enforcement",
    };
    let documentAssistantResponse: AgentResponse | null = null;

    try {
      const selectedAgent = router.getAgent(routeDecision);

      if (selectedAgent) {
        const agentResponse = await selectedAgent.answer({
          question,
          user: {
            identity,
            email: identity?.email || null,
            displayName: identity?.displayName || null,
            tenantId: identity?.tenantId || null,
          },
          resolvedRoles: resolvedRoles.roles,
          channel: identity?.channel || "mcp",
          tenantValidated: resolvedRoles.tenantValidated,
          routeDecision,
          userEmail: identity?.email || null,
          conversationId: identity?.conversationId || null,
        });

        if (routeDecision.agent === "document_assistant") {
          documentAssistantResponse = agentResponse;
        }
      }
    } catch (dryRunError) {
      console.warn("Agent observe-only dry-run failed:", dryRunError);
    }

    if (
      routeDecision.agent === "document_assistant" &&
      documentAssistantResponse?.answer &&
      documentAssistantResponse.toolsUsed.some(
        (tool) => tool.toolName === "draftDocument" && tool.success
      )
    ) {
      await writeAuditLog({
        userEmail: identity?.email || null,
        action: "agent_router_document_assistant",
        route: "/api/ai-tools/answer-question",
        metadata: {
          channel: identity?.channel || "unknown",
          teamsUserId: identity?.teamsUserId || null,
          aadObjectId: identity?.aadObjectId || null,
          displayName: identity?.displayName || null,
          tenantId: identity?.tenantId || null,
          conversationId: identity?.conversationId || null,
          tenantValidated: resolvedRoles.tenantValidated,
          resolvedRoles: resolvedRoles.roles,
          roleSource: resolvedRoles.roleSource,
          selectedAgent: routeDecision.agent,
          routeConfidence: routeDecision.confidence,
          routeReason: routeDecision.reason,
          matchedKeywords: routeDecision.matchedKeywords,
          permissionDecision,
          toolOrEndpoint: "draftDocument",
          observeOnly: true,
          answerSource: "document_assistant",
        },
      });

      return NextResponse.json({
        success: true,
        question,
        answer: documentAssistantResponse.answer,
        retrievedChunks: 0,
        retrieval: {
          topSimilarity: 0,
          hasStrongInternalMatch: false,
          hasPossibleInternalMatch: false,
        },
        sources: [],
      });
    }

    const result = await answerQuestion({
      question,
      limit,
      category,
      audit: false,
    });

    const topSimilarity = Number(result.sources[0]?.similarity || 0);
    const hasStrongInternalMatch = topSimilarity >= 0.62;
    const hasPossibleInternalMatch = topSimilarity >= 0.48;

    await writeAuditLog({
      userEmail: identity?.email || null,
      action: "agent_router_observe_only",
      route: "/api/ai-tools/answer-question",
      metadata: {
        channel: identity?.channel || "unknown",
        teamsUserId: identity?.teamsUserId || null,
        aadObjectId: identity?.aadObjectId || null,
        displayName: identity?.displayName || null,
        tenantId: identity?.tenantId || null,
        conversationId: identity?.conversationId || null,
        tenantValidated: resolvedRoles.tenantValidated,
        resolvedRoles: resolvedRoles.roles,
        roleSource: resolvedRoles.roleSource,
        selectedAgent: routeDecision.agent,
        routeConfidence: routeDecision.confidence,
        routeReason: routeDecision.reason,
        matchedKeywords: routeDecision.matchedKeywords,
        permissionDecision,
        toolOrEndpoint: "answer-question",
        observeOnly: true,
      },
    });

    return NextResponse.json({
      success: true,
      question,
      answer: result.answer,
      retrievedChunks: result.retrievedChunks,
      retrieval: {
        topSimilarity,
        hasStrongInternalMatch,
        hasPossibleInternalMatch,
      },
      sources: result.sources.map((source) => ({
        chunkId: source.id,
        documentId: source.documentId,
        title: source.title,
        category: source.category,
        source: source.source,
        sourceUrl: source.sourceUrl,
        externalId: source.externalId,
        similarity: Number(source.similarity),
        chunkIndex: source.chunkIndex,
      })),
    });
  } catch (error: any) {
    console.error("AI tool answer question error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to answer question",
      },
      { status: 500 }
    );
  }
}
