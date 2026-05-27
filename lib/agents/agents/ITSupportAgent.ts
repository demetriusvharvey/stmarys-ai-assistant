import type { Agent, AgentRequest, AgentResponse } from "../types";
import { ToolRegistry } from "@/lib/tools/ToolRegistry";

const IT_KEYWORDS = [
  "caretracker",
  "sigmacare",
  "microsoft 365",
  "office 365",
  "outlook",
  "teams",
  "sharepoint",
  "unifi",
  "printer",
  "scanner",
  "copier",
  "password",
  "login",
  "email",
  "computer",
  "laptop",
  "network",
  "wifi",
  "wi-fi",
];

export class ITSupportAgent implements Agent {
  name = "it_support" as const;
  mode = "it_support" as const;
  private readonly toolRegistry = new ToolRegistry();

  canHandle(request: AgentRequest) {
    const question = request.question.toLowerCase();
    return IT_KEYWORDS.some((keyword) => question.includes(keyword));
  }

  async answer(request: AgentRequest): Promise<AgentResponse> {
    const toolResult = await this.toolRegistry.call(
      "searchITKnowledge",
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
      answer: "IT Support Agent is not wired yet.",
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
          toolName: "searchITKnowledge",
          success: toolResult.success,
          inputSummary: "Stub IT knowledge search.",
          outputSummary: "Observe-only stub tool call.",
        },
      ],
      auditMetadata: {},
    };
  }
}
