import { writeAuditLog } from "@/lib/audit";
import { evaluateToolPermission } from "./permission";
import { toolDefinitions } from "./toolDefinitions";
import type {
  ToolContext,
  ToolDefinition,
  ToolName,
  ToolResult,
} from "./types";

export class ToolRegistry {
  private readonly tools: Map<ToolName, ToolDefinition>;

  constructor(definitions = toolDefinitions) {
    this.tools = new Map(definitions.map((tool) => [tool.name, tool]));
  }

  async call(
    toolName: ToolName,
    input: unknown,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(toolName);

    if (!tool) {
      const permission = {
        allowed: false,
        wouldAllow: false,
        observeOnlyAllowed: false,
        reason: "tool_not_registered",
        readOnly: true,
        requiresConfirmation: false,
        observeOnly: true,
      };

      await this.logToolDecision({
        toolName,
        input,
        context,
        permission,
        success: false,
        outputSummary: "Tool is not registered.",
      });

      return {
        success: false,
        denied: true,
        reason: "tool_not_registered",
        permission,
      };
    }

    const permission = evaluateToolPermission(tool, {
      ...context,
      observeOnly: true,
    });

    await this.logToolDecision({
      toolName,
      input,
      context,
      permission,
      success: true,
      outputSummary: "Observe-only permission decision logged.",
    });

    const data = await tool.run(input, context);

    return {
      success: true,
      data,
      permission,
    };
  }

  private async logToolDecision({
    toolName,
    input,
    context,
    permission,
    success,
    outputSummary,
  }: {
    toolName: ToolName;
    input: unknown;
    context: ToolContext;
    permission: ToolResult["permission"];
    success: boolean;
    outputSummary: string;
  }) {
    await writeAuditLog({
      userEmail: context.userEmail || null,
      action: "tool_registry_observe_only",
      route: "ToolRegistry.call",
      metadata: {
        agentRunId: context.agentRunId || null,
        selectedAgent: context.selectedAgent,
        channel: context.channel,
        userRoles: context.userRoles,
        toolName,
        inputSummary: summarizeValue(input),
        permission,
        success,
        outputSummary,
        observeOnly: true,
      },
    });
  }
}

function summarizeValue(value: unknown) {
  if (value == null) return null;

  if (typeof value === "string") {
    return redactSensitiveSummary(value).slice(0, 200);
  }

  try {
    return redactSensitiveSummary(JSON.stringify(value)).slice(0, 200);
  } catch {
    return "[unserializable input]";
  }
}

function redactSensitiveSummary(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[PHONE]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]")
    .replace(/\b(MRN|Medical Record Number)\s*[:#-]?\s*[A-Z0-9-]+/gi, "$1: [REDACTED]")
    .replace(/\b(DOB|D\.O\.B\.|Date of Birth)\s*[:#-]?\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/gi, "$1: [REDACTED]")
    .replace(/\b(room)\s*[:#-]?\s*[A-Z0-9-]+/gi, "$1: [REDACTED]")
    .replace(/\b(resident|patient)\s*[:#-]?\s+[A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)?/gi, "$1: [REDACTED]")
    .replace(/\b(ssn|phone|email)\s*[:#-]?\s*[^,\n}]+/gi, "$1: [REDACTED]");
}
