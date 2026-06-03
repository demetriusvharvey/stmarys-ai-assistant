import { writeAuditLog } from "@/lib/audit";
import { evaluateToolPermission } from "./permission";
import { toolDefinitions } from "./toolDefinitions";
import type {
  ToolAuditDecision,
  ToolAuditMetadata,
  ToolContext,
  ToolDefinition,
  ToolName,
  ToolPermissionDecision,
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
        actuallyAllowed: false,
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
        outputSummary: "Tool is not registered.",
      });

      return {
        success: false,
        denied: true,
        reason: "tool_not_registered",
        permission,
      };
    }

    const permission = evaluateToolPermission(tool, context);

    // Enforce permissions — deny if agent or role is not allowed
    if (!permission.actuallyAllowed) {
      await this.logToolDecision({
        toolName,
        input,
        context,
        permission,
        outputSummary: `Tool denied: ${permission.reason}`,
      });

      return {
        success: false,
        denied: true,
        reason: permission.reason,
        permission,
      };
    }

    await this.logToolDecision({
      toolName,
      input,
      context,
      permission,
      outputSummary: "Permission granted — tool executing.",
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
    outputSummary,
  }: {
    toolName: ToolName;
    input: unknown;
    context: ToolContext;
    permission: ToolPermissionDecision;
    outputSummary: string;
  }) {
    const auditMetadata: ToolAuditMetadata = {
      tool: toolName,
      user: context.userEmail ?? null,
      roles: context.userRoles,
      roleSource: context.roleSource ?? null,
      selectedAgent: context.selectedAgent,
      channel: context.channel,
      agentRunId: context.agentRunId ?? null,
      decision: toAuditDecision(permission),
      reason: permission.reason,
      wouldAllow: permission.wouldAllow,
      observeOnlyAllowed: permission.observeOnlyAllowed,
      actuallyAllowed: permission.actuallyAllowed,
      inputSummary: summarizeValue(input),
      outputSummary,
      observeOnly: permission.observeOnly,
    };

    await writeAuditLog({
      userEmail: context.userEmail ?? null,
      action: "tool_call",
      route: "ToolRegistry.call",
      metadata: auditMetadata,
    });
  }
}

/**
 * Maps a ToolPermissionDecision to the ToolAuditDecision written to audit logs.
 *
 * While observeOnly is active the decision is always "observe_only_pass"
 * regardless of whether wouldAllow is true or false — the distinction is
 * preserved in the wouldAllow field for shadow analysis.
 *
 * Once enforcement is enabled (observeOnly removed), this will return
 * "allowed" or "denied" based on actuallyAllowed.
 */
function toAuditDecision(permission: ToolPermissionDecision): ToolAuditDecision {
  if (permission.reason === "tool_not_registered") return "tool_not_registered";
  if (permission.observeOnlyAllowed) return "observe_only_pass";
  return permission.actuallyAllowed ? "allowed" : "denied";
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
