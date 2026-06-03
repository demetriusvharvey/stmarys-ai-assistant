import type { Agent, AgentRequest, AgentResponse } from "../types";
import { ToolRegistry } from "@/lib/tools/ToolRegistry";

export class InternalKnowledgeAgent implements Agent {
  name = "internal_knowledge" as const;
  mode = "internal" as const;
  private readonly toolRegistry = new ToolRegistry();

  canHandle(_request: AgentRequest) {
    return true;
  }

  async answer(request: AgentRequest): Promise<AgentResponse> {
    const toolResult = await this.toolRegistry.call(
      "searchInternalKnowledge",
      { query: request.question },
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

    return {
      answer:
        "## Internal Knowledge\n\nInternal Knowledge Agent is not wired yet.",
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
          toolName: "searchInternalKnowledge",
          success: toolResult.success,
          inputSummary: "Stub internal knowledge search.",
          outputSummary: "Observe-only stub tool call.",
        },
      ],
      auditMetadata: {},
    };
  }
}
