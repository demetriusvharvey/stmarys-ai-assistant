import { answerQuestion } from "@/lib/ai/answerQuestion";
import type { Agent, AgentRequest, AgentResponse } from "../types";
import { isPaylocityConfigured, getEmployee, getPtoBalances } from "@/lib/integrations/paylocity/client";

// Keywords that suggest the user wants live balance/data vs. policy info
const LIVE_DATA_KEYWORDS = [
  "my pto", "my balance", "how much pto", "how many days", "days left",
  "pto balance", "sick balance", "vacation balance", "my hours",
  "my pay", "my paycheck", "last paycheck", "paycheck amount",
];

function wantsLiveData(question: string): boolean {
  const q = question.toLowerCase();
  return LIVE_DATA_KEYWORDS.some((kw) => q.includes(kw));
}

function formatPtoSummary(pto: Awaited<ReturnType<typeof getPtoBalances>>): string {
  if (!pto?.balances?.length) return "";
  const lines = pto.balances.map((b) =>
    `- **${b.timeOffDescription}**: ${b.accruedBalance.toFixed(1)} hrs available (${b.usedBalanceCurrentYear.toFixed(1)} used this year)`
  );
  return `\n\n### Your Current PTO Balances\n${lines.join("\n")}`;
}

export class PayrollBenefitsAgent implements Agent {
  name = "payroll_benefits" as const;
  displayName = "Payroll & Benefits Agent";
  icon = "💰";
  mode = "payroll_benefits" as const;

  canHandle(_request: AgentRequest) {
    return false;
  }

  async answer(request: AgentRequest): Promise<AgentResponse> {
    const userEmail = request.user?.email || request.userEmail || null;
    let liveContext = "";
    const toolsUsed: AgentResponse["toolsUsed"] = [];

    // Attempt live Paylocity lookup for balance/data questions
    if (isPaylocityConfigured() && wantsLiveData(request.question) && userEmail) {
      try {
        // Employee ID lookup by email would require a mapping table or search.
        // For now we surface a note if Paylocity is configured but no ID is available.
        liveContext = "\n\n> **Note:** Paylocity is connected. To look up your specific balance, provide your Paylocity Employee ID.";
        toolsUsed.push({
          toolName: "paylocityLookup",
          success: false,
          inputSummary: "Attempted PTO balance lookup — employee ID required.",
          outputSummary: "Employee ID not available from session.",
        });
      } catch (err: any) {
        toolsUsed.push({
          toolName: "paylocityLookup",
          success: false,
          inputSummary: "Paylocity live lookup failed.",
          outputSummary: err.message,
        });
      }
    }

    const result = await answerQuestion({
      question: request.question,
      userEmail,
      conversationId: request.conversationId || null,
      conversationHistory: request.conversationHistory,
      audit: false,
    });

    const answer = result.answer + liveContext;

    toolsUsed.push({
      toolName: "answerQuestion",
      success: true,
      inputSummary: "Payroll, benefits, and PTO knowledge lookup.",
      outputSummary: result.verification.answerMode === "internal_document_supported"
        ? "Internal source-backed answer."
        : "General guidance — no approved internal source found.",
    });

    return {
      answer,
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
      toolsUsed,
      auditMetadata: {
        answerMode: result.verification.answerMode,
        retrievedChunks: result.retrievedChunks,
        displayName: this.displayName,
        icon: this.icon,
        paylocityConfigured: isPaylocityConfigured(),
      },
    };
  }
}
