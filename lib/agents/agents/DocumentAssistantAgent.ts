import type { Agent, AgentRequest, AgentResponse } from "../types";
import { ToolRegistry } from "@/lib/tools/ToolRegistry";

const DOCUMENT_KEYWORDS = [
  "draft",
  "write",
  "executive summary",
  "leadership summary",
  "summarize for leadership",
  "summarize for the ceo",
  "summarize for the cfo",
  "create an sop",
  "make an sop",
  "checklist",
  "template",
  "email",
  "incident report",
  "document this",
];

function getDraftFromToolData(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "draft" in data &&
    typeof (data as { draft?: unknown }).draft === "string"
  ) {
    return (data as { draft: string }).draft;
  }

  return null;
}

export class DocumentAssistantAgent implements Agent {
  name = "document_assistant" as const;
  mode = "document_assistant" as const;
  private readonly toolRegistry = new ToolRegistry();

  canHandle(request: AgentRequest) {
    const question = request.question.toLowerCase();
    return DOCUMENT_KEYWORDS.some((keyword) => question.includes(keyword));
  }

  async answer(request: AgentRequest): Promise<AgentResponse> {
    const toolResult = await this.toolRegistry.call(
      "draftDocument",
      { prompt: request.question },
      {
        userEmail: request.user?.email || request.userEmail || null,
        userRoles: request.resolvedRoles || ["service"],
        selectedAgent: this.name,
        channel: request.channel || "web",
        agentRunId: request.routeDecision
          ? `${request.routeDecision.agent}:${request.routeDecision.reason}`
          : null,
        observeOnly: true,
      }
    );
    const draft = toolResult.success ? getDraftFromToolData(toolResult.data) : null;

    return {
      answer:
        draft ||
        "## Draft Unavailable\n\nDocument Assistant Agent could not generate a draft.",
      agent: this.name,
      mode: this.mode,
      sources: [],
      safety: {
        blocked: false,
        phiDetected: false,
        residentSpecific: false,
        urgent: false,
      },
      toolsUsed: [
        {
          toolName: "draftDocument",
          success: Boolean(draft),
          inputSummary: "Document draft request.",
          outputSummary: draft
            ? "Generated draftDocument output."
            : "draftDocument did not return draft text.",
        },
      ],
      auditMetadata: {},
    };
  }
}
