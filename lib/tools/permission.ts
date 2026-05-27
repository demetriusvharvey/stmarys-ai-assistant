import type {
  ToolContext,
  ToolDefinition,
  ToolPermissionDecision,
} from "./types";

export function evaluateToolPermission(
  tool: ToolDefinition,
  context: ToolContext
): ToolPermissionDecision {
  const observeOnly = context.observeOnly !== false;
  const matchedRole = context.userRoles.find((role) =>
    tool.allowedRoles.includes(role)
  );
  const agentAllowed = tool.allowedAgents.includes(context.selectedAgent);
  const roleAllowed = Boolean(matchedRole);
  const wouldAllow = agentAllowed && roleAllowed;

  if (observeOnly) {
    return {
      allowed: true,
      wouldAllow,
      observeOnlyAllowed: true,
      // In observe-only mode actuallyAllowed mirrors wouldAllow so that
      // shadow analysis in audit logs shows what enforcement WOULD decide,
      // without blocking any calls today.
      actuallyAllowed: wouldAllow,
      reason: "observe_only_no_enforcement",
      matchedRole,
      readOnly: tool.readOnly,
      requiresConfirmation: tool.requiresConfirmation,
      observeOnly: true,
    };
  }

  if (!agentAllowed) {
    return {
      allowed: false,
      wouldAllow: false,
      observeOnlyAllowed: false,
      actuallyAllowed: false,
      reason: "agent_not_allowed_for_tool",
      matchedRole,
      readOnly: tool.readOnly,
      requiresConfirmation: tool.requiresConfirmation,
      observeOnly: false,
    };
  }

  if (!roleAllowed) {
    return {
      allowed: false,
      wouldAllow: false,
      observeOnlyAllowed: false,
      actuallyAllowed: false,
      reason: "role_not_allowed_for_tool",
      readOnly: tool.readOnly,
      requiresConfirmation: tool.requiresConfirmation,
      observeOnly: false,
    };
  }

  return {
    allowed: true,
    wouldAllow: true,
    observeOnlyAllowed: false,
    actuallyAllowed: true,
    reason: "allowed",
    matchedRole,
    readOnly: tool.readOnly,
    requiresConfirmation: tool.requiresConfirmation,
    observeOnly: false,
  };
}
