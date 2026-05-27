import { answerQuestion } from "@/lib/ai/answerQuestion";
import type { Agent, AgentRequest, AgentResponse } from "../types";

const POLICY_KEYWORDS = [
  "policy",
  "sop",
  "procedure",
  "attendance",
  "handbook",
  "guideline",
  "process",
];

export class PolicyAgent implements Agent {
  name = "policy" as const;
  displayName = "Policy Agent";
  icon = "📋";
  mode = "policy" as const;

  canHandle(request: AgentRequest) {
    const question = request.question.toLowerCase();
    return POLICY_KEYWORDS.some((keyword) => question.includes(keyword));
  }

  async answer(request: AgentRequest): Promise<AgentResponse> {
    const result = await answerQuestion({
      question: request.question,
      userEmail: request.user?.email || request.userEmail || null,
      conversationId: request.conversationId || null,
      conversationHistory: request.conversationHistory,
      audit: false,
    });

    return {
      answer: result.answer,
      agent: this.name,
      mode: this.mode,
      sources: result.sources.map((source) => ({
        id: source.id,
        documentId: source.documentId,
        title: source.title,
        category: source.category,
        source: source.source,
        sourceUrl: source.sourceUrl,
        similarity: source.similarity,
      })),
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
          inputSummary: "Policy/internal knowledge RAG answer.",
          outputSummary:
            result.verification.answerMode === "internal_document_supported"
              ? "Strong internal source-backed answer."
              : "No approved internal source found or weak source match.",
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
