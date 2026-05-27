export type AgentName =
  | "internal_knowledge"
  | "policy"
  | "executive"
  | "medical_education"
  | "it_support"
  | "document_assistant";

export type UserRole =
  | "staff"
  | "it_staff"
  | "admin"
  | "service"
  | "unknown";

export type AgentIdentity = {
  channel?: "teams" | "web" | "mcp" | string;
  teamsUserId?: string | null;
  aadObjectId?: string | null;
  email?: string | null;
  displayName?: string | null;
  tenantId?: string | null;
  conversationId?: string | null;
};

export type AgentUser = {
  identity?: AgentIdentity | null;
  email?: string | null;
  displayName?: string | null;
  tenantId?: string | null;
};

export type AgentMode =
  | "internal"
  | "policy"
  | "executive"
  | "medical_education"
  | "it_support"
  | "document_assistant";

export type AgentSource = {
  id?: string;
  documentId?: string;
  title: string;
  category?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  similarity?: number | string | null;
};

export type ToolCallSummary = {
  toolName: string;
  success: boolean;
  inputSummary?: string;
  outputSummary?: string;
};

export type AgentSafety = {
  blocked: boolean;
  reason?: string;
  phiDetected: boolean;
  residentSpecific: boolean;
  urgent: boolean;
};

export type AgentRequest = {
  question: string;
  user?: AgentUser | null;
  resolvedRoles?: UserRole[];
  channel?: "teams" | "web" | "mcp" | string;
  tenantValidated?: boolean;
  routeDecision?: RouteDecision;
  userEmail?: string | null;
  conversationId?: string | null;
  conversationHistory?: {
    role: "user" | "assistant";
    content: string;
  }[];
};

export type AgentResponse = {
  answer: string;
  agent: AgentName;
  mode: AgentMode;
  sources: AgentSource[];
  safety: AgentSafety;
  toolsUsed: ToolCallSummary[];
  auditMetadata: Record<string, unknown>;
};

export type RouteDecision = {
  agent: AgentName;
  confidence: number;
  reason: string;
  matchedKeywords: string[];
};

export interface Agent {
  name: AgentName;
  mode: AgentMode;
  canHandle(request: AgentRequest): boolean;
  answer(request: AgentRequest): Promise<AgentResponse>;
}
