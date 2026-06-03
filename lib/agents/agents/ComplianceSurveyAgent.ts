import { answerQuestion } from "@/lib/ai/answerQuestion";
import type { Agent, AgentRequest, AgentResponse } from "../types";

export class ComplianceSurveyAgent implements Agent {
  name = "compliance_survey" as const;
  displayName = "Compliance Survey";
  icon = "📋";
  mode = "compliance_survey" as const;

  canHandle(_request: AgentRequest) {
    return false; // Routing handled by AgentRouter
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
      sources: result.sources.map((s) => ({
        id: s.id,
        documentId: s.documentId,
        title: s.title,
        category: s.category,
        source: s.source,
        sourceUrl: s.sourceUrl,
        similarity: s.similarity,
      })),
      safety: {
        blocked: false,
        phiDetected: false,
        residentSpecific: false,
        urgent: result.escalation.urgency === "high",
      },
      toolsUsed: [{
        toolName: "answerQuestion",
        success: true,
        inputSummary: "Compliance and survey prep knowledge lookup.",
        outputSummary: result.verification.answerMode === "internal_document_supported"
          ? "Internal source-backed answer."
          : "General guidance — no approved internal source found.",
      }],
      auditMetadata: {
        answerMode: result.verification.answerMode,
        retrievedChunks: result.retrievedChunks,
        displayName: this.displayName,
        icon: this.icon,
      },
    };
  }
}
