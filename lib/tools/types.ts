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
  selectedAgent: AgentName;
  channel: ToolChannel;
  agentRunId?: string | null;
  observeOnly?: boolean;
};

export type ToolPermissionDecision = {
  allowed: boolean;
  wouldAllow: boolean;
  observeOnlyAllowed: boolean;
  reason: string;
  matchedRole?: UserRole;
  readOnly: boolean;
  requiresConfirmation: boolean;
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
