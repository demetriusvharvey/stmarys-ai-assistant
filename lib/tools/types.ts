import type { AgentName, UserRole } from "@/lib/agents/types";

export type ToolName =
  | "searchInternalKnowledge"
  | "openInternalDocument"
  | "searchITKnowledge"
  | "getSyncStatus"
  | "searchApprovedHealthSources"
  | "fetchApprovedWebPage"
  | "draftDocument";

export type ToolRisk = "low" | "medium" | "high";

export type ToolChannel = "teams" | "web" | "mcp" | string;

export type ToolContext = {
  userEmail?: string | null;
  userRoles: UserRole[];
  /**
   * How roles were resolved (e.g. "admin_email_allowlist", "validated_tenant_default_staff").
   * Populated by resolveUserRoles; threaded through to audit logs.
   */
  roleSource?: string | null;
  selectedAgent: AgentName;
  channel: ToolChannel;
  agentRunId?: string | null;
  observeOnly?: boolean;
};

export type ToolPermissionDecision = {
  /**
   * Effective gate used by ToolRegistry today.
   * Currently always true while observeOnly is active.
   */
  allowed: boolean;
  /**
   * What enforcement WOULD decide based on agent + role checks,
   * regardless of observe-only mode. Use for shadow analysis and
   * pre-flight validation before enforcement is turned on.
   */
  wouldAllow: boolean;
  /**
   * True when the call is allowed solely because observe-only mode
   * bypasses enforcement. Always false once enforcement is active.
   */
  observeOnlyAllowed: boolean;
  /**
   * The effective gate once enforcement is active.
   * In observe-only mode this mirrors wouldAllow (what WOULD happen).
   * When enforcement is enabled, this is what actually blocks tool.run().
   */
  actuallyAllowed: boolean;
  reason: string;
  matchedRole?: UserRole;
  readOnly: boolean;
  requiresConfirmation: boolean;
  observeOnly: boolean;
};

/**
 * The effective decision written to every audit_logs entry from ToolRegistry.
 *
 * "observe_only_pass"   — tool ran; enforcement bypassed (observe mode active).
 *                         Check wouldAllow for what enforcement would have decided.
 * "tool_not_registered" — tool name not in registry; call rejected.
 * "allowed"             — (future) enforcement active and call permitted.
 * "denied"              — (future) enforcement active and call blocked.
 */
export type ToolAuditDecision =
  | "observe_only_pass"
  | "tool_not_registered"
  | "allowed"
  | "denied";

/**
 * Structured fields written to every audit_logs entry emitted by ToolRegistry.
 * Use this shape when reading audit rows to understand tool call outcomes.
 */
export type ToolAuditMetadata = {
  tool: ToolName | string;
  user: string | null;
  roles: UserRole[];
  roleSource: string | null;
  selectedAgent: AgentName;
  channel: ToolChannel;
  agentRunId: string | null;
  /** Effective audit outcome. See ToolAuditDecision for semantics. */
  decision: ToolAuditDecision;
  /** Raw reason string from the permission evaluator. */
  reason: string;
  /** Would enforcement have allowed this call? */
  wouldAllow: boolean;
  /** Was this allowed solely by observe-only bypass? */
  observeOnlyAllowed: boolean;
  /** Effective gate (mirrors wouldAllow in observe mode; enforcement result otherwise). */
  actuallyAllowed: boolean;
  inputSummary: string | null;
  outputSummary: string;
  observeOnly: boolean;
};

export type ToolResult = {
  success: boolean;
  denied?: boolean;
  reason?: string;
  data?: unknown;
  permission: ToolPermissionDecision;
};

export type ToolDefinition = {
  name: ToolName;
  description: string;
  readOnly: boolean;
  risk: ToolRisk;
  allowedAgents: AgentName[];
  allowedRoles: UserRole[];
  requiresConfirmation: boolean;
  run(input: unknown, context: ToolContext): Promise<unknown>;
};
