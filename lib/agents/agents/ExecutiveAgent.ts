import { answerQuestion } from "@/lib/ai/answerQuestion";
import type { Agent, AgentRequest, AgentResponse } from "../types";

const EXECUTIVE_KEYWORDS = [
  "executive",
  "summarize for leadership",
  "leadership",
  "cfo",
  "ceo",
  "risk",
  "trend",
  "status",
  "overview",
  "recommendation",
  "briefing",
];

function formatExecutiveAnswer(answer: string, hasStrongSource: boolean) {
  if (!hasStrongSource) {
    return "## Executive Summary\n\nNo approved internal source found.";
  }

  return `## Executive Summary

${answer.trim()}

## Key Findings
- See the source-backed summary above.

## Risks
- Do not treat inferred or missing operational metrics as confirmed.

## Recommended Actions
- Review the cited internal source material before making operational decisions.`;
}

export class ExecutiveAgent implements Agent {
  name = "executive" as const;
  displayName = "Executive Agent";
  icon = "📊";
  mode = "executive" as const;

  canHandle(request: AgentRequest) {
    const question = request.question.toLowerCase();
    return EXECUTIVE_KEYWORDS.some((keyword) => question.includes(keyword));
  }

  async answer(request: AgentRequest): Promise<AgentResponse> {
    const result = await answerQuestion({
      question: request.question,
      userEmail: request.user?.email || request.userEmail || null,
      conversationId: request.conversationId || null,
      conversationHistory: request.conversationHistory,
      audit: false,
    });
    const hasStrongSource =
      result.verification.answerMode === "internal_document_supported";

    return {
      answer: formatExecutiveAnswer(result.answer, hasStrongSource),
      agent: this.name,
      mode: this.mode,
      sources: hasStrongSource
        ? result.sources.map((source) => ({
            id: source.id,
            documentId: source.documentId,
            title: source.title,
            category: source.category,
            source: source.source,
            sourceUrl: source.sourceUrl,
            similarity: source.similarity,
          }))
        : [],
      safety: {
        blocked: false,
        phiDetected: false,
        residentSpecific: false,
        urgent: result.escalation.urgency === "high",
      },
      toolsUsed: [
        {
          toolName: "answerQuestion",
          success: true,
          inputSummary: "Executive/internal knowledge RAG answer.",
          outputSummary: hasStrongSource
            ? "Strong internal source-backed executive summary."
            : "No approved internal source found.",
        },
      ],
      auditMetadata: {
        answerMode: result.verification.answerMode,
        retrievedChunks: result.retrievedChunks,
        displayName: this.displayName,
        icon: this.icon,
      },
    };
  }
}
