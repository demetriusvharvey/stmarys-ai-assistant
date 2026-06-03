export type AgentDepartment =
  | "general"
  | "hr"
  | "it"
  | "leadership"
  | "operations";

export type AgentStatus =
  | "Active"
  | "Observe-only"
  | "Drafting"
  | "Needs approval"
  | "Disabled"
  | "Future";

export type AgentRiskLevel = "Low" | "Medium" | "High";

export type AgentRegistryItem = {
  name: string;
  displayName: string;
  icon: string;
  department: AgentDepartment;
  departmentLabel: string;
  purpose: string;
  status: AgentStatus;
  riskLevel: AgentRiskLevel;
  responsibilities: string[];
  examplePrompts: string[];
  tasks: string[];
  sources: string[];
  safetyNotes: string[];
  tools: string[];
  workflows: string[];
  implemented: boolean;
};

export const departmentOrder: AgentDepartment[] = [
  "general",
  "hr",
  "it",
  "leadership",
  "operations",
];

export const departmentLabels: Record<AgentDepartment, string> = {
  general: "General / Knowledge",
  hr: "HR",
  it: "IT",
  leadership: "Leadership",
  operations: "Operations",
};

export const agentRegistry: AgentRegistryItem[] = [
  {
    name: "policy",
    displayName: "Policy Agent",
    icon: "📋",
    department: "general",
    departmentLabel: departmentLabels.general,
    purpose:
      "Answers policy, SOP, procedure, attendance, handbook, guideline, and internal process questions from approved internal knowledge.",
    status: "Active",
    riskLevel: "Medium",
    responsibilities: ["Answer internal policy questions", "Explain SOPs and procedures", "Summarize approved source-backed guidance"],
    examplePrompts: ["Summarize the attendance policy", "Where is the PTO procedure documented?", "Explain this SOP in plain language"],
    tasks: ["Policy lookup", "SOP explanation", "Procedure summary", "Attendance or handbook Q&A"],
    sources: ["Approved SharePoint policy documents", "Internal SOPs", "Handbooks and guidelines synced to the knowledge base"],
    safetyNotes: ["Requires strong internal source support", "Should not invent operational policy details", "Escalates weak-source answers as no approved internal source found"],
    tools: ["Internal knowledge retrieval", "Source confidence checks"],
    workflows: ["Policy lookup", "SOP explanation", "Internal source summary"],
    implemented: true,
  },
  {
    name: "medical_education",
    displayName: "Medical Education Agent",
    icon: "🏥",
    department: "general",
    departmentLabel: departmentLabels.general,
    purpose:
      "Classifies general health education questions and refuses resident-specific, PHI, diagnostic, medication, or urgent clinical requests.",
    status: "Active",
    riskLevel: "High",
    responsibilities: ["Classify health education requests", "Provide general education-only responses", "Refuse resident-specific or urgent clinical guidance"],
    examplePrompts: ["What is dehydration?", "Explain C. diff in general terms", "Give fall prevention education for staff"],
    tasks: ["General health education triage", "Medical safety refusal", "Approved-source education response"],
    sources: ["Future approved public medical source allowlist", "MedlinePlus / NIH", "CDC", "Mayo Clinic or Cleveland Clinic if approved"],
    safetyNotes: ["No PHI", "No resident-specific advice", "No diagnosis, medication dosing, or treatment decisions", "Escalates urgent symptoms to nurse, provider, leadership, or 911"],
    tools: ["Safety classification"],
    workflows: ["General health education triage", "Clinical safety refusal"],
    implemented: true,
  },
  {
    name: "document_assistant",
    displayName: "HR Agent",
    icon: "👥",
    department: "hr",
    departmentLabel: departmentLabels.hr,
    purpose:
      "Drafts staff-facing documents, emails, checklists, onboarding content, executive summaries, and operational templates.",
    status: "Active",
    riskLevel: "Medium",
    responsibilities: ["Draft staff-facing documents", "Generate onboarding/checklist content", "Create emails, summaries, and templates"],
    examplePrompts: ["Create a new nurse onboarding checklist", "Draft an email about a printer outage", "Summarize this for leadership"],
    tasks: ["Email drafting", "Checklist generation", "Document summary", "Template creation"],
    sources: ["User prompt", "Approved internal context when provided", "Existing document drafting rules"],
    safetyNotes: ["Generated drafts are not official policy unless backed by approved sources", "Should avoid PHI and sensitive resident information"],
    tools: ["Draft document"],
    workflows: ["Email drafting", "Checklist generation", "Document summaries"],
    implemented: true,
  },
  {
    name: "onboarding",
    displayName: "Onboarding Agent",
    icon: "🧭",
    department: "hr",
    departmentLabel: departmentLabels.hr,
    purpose:
      "Future specialist for role-based onboarding plans, training paths, system access checklists, and new-hire readiness.",
    status: "Future",
    riskLevel: "Medium",
    responsibilities: ["Plan role-based onboarding", "Coordinate training readiness", "Prepare access and setup checklists"],
    examplePrompts: ["Build a CNA onboarding plan", "Create a new hire readiness checklist", "Prepare a first-week training path"],
    tasks: ["New-hire onboarding plan", "Training checklist", "Role readiness summary"],
    sources: ["Future HR onboarding source library", "Training materials", "Role-specific checklists"],
    safetyNotes: ["Future agent; should avoid employee-sensitive details until permissions and auditing exist"],
    tools: [],
    workflows: ["New-hire onboarding", "Training path planning"],
    implemented: false,
  },
  {
    name: "it_support",
    displayName: "IT Support Agent",
    icon: "🖥",
    department: "it",
    departmentLabel: departmentLabels.it,
    purpose:
      "Routes IT troubleshooting questions for CareTracker, SigmaCare, Microsoft 365, UniFi, printers, login, and access issues.",
    status: "Active",
    riskLevel: "Medium",
    responsibilities: ["Triage staff IT questions", "Provide troubleshooting guidance", "Route system-specific support requests"],
    examplePrompts: ["Troubleshoot a SigmaCare login issue", "Why can’t I print?", "Help with Microsoft 365 sign-in"],
    tasks: ["Troubleshooting guidance", "Login/access triage", "Printer and network support guidance"],
    sources: ["IT knowledge base", "System support notes", "Approved troubleshooting documentation"],
    safetyNotes: ["Read-only by default", "No account changes without explicit future approval workflows", "IT-only tasks require role enforcement before live actions"],
    tools: ["IT knowledge search"],
    workflows: ["Troubleshooting guidance", "System access triage"],
    implemented: true,
  },
  {
    name: "issuetrak_ticket",
    displayName: "Issuetrak Ticket Agent",
    icon: "🎫",
    department: "it",
    departmentLabel: departmentLabels.it,
    purpose:
      "Future specialist for summarizing support issues and preparing ticket-ready intake details.",
    status: "Future",
    riskLevel: "Medium",
    responsibilities: ["Prepare support ticket summaries", "Collect issue intake details", "Structure escalation-ready tickets"],
    examplePrompts: ["Create an IssueTrak ticket draft for printer outage", "Summarize this support issue", "Prepare ticket intake details"],
    tasks: ["Ticket drafting", "Issue intake", "Escalation summary"],
    sources: ["Future ticketing rules", "IT support intake fields", "User-provided issue details"],
    safetyNotes: ["Future agent; should not submit real tickets until approval controls exist"],
    tools: [],
    workflows: ["Ticket drafting", "Issue intake"],
    implemented: false,
  },
  {
    name: "account_access",
    displayName: "Account Access Agent",
    icon: "🔐",
    department: "it",
    departmentLabel: departmentLabels.it,
    purpose:
      "Future specialist for read-only account access triage, role mapping, and access request preparation.",
    status: "Future",
    riskLevel: "High",
    responsibilities: ["Triage access requests", "Explain role mapping", "Prepare access request drafts"],
    examplePrompts: ["What access does a nurse need?", "Prepare an access request for SigmaCare", "Review this account access issue"],
    tasks: ["Access review", "Role request preparation", "Permission explanation"],
    sources: ["Future access policy source library", "Role mapping rules", "System access procedures"],
    safetyNotes: ["High risk", "Read-only until strict identity, approval, and audit controls exist"],
    tools: [],
    workflows: ["Access review", "Role request preparation"],
    implemented: false,
  },
  {
    name: "executive",
    displayName: "Executive Agent",
    icon: "📊",
    department: "leadership",
    departmentLabel: departmentLabels.leadership,
    purpose:
      "Helps leadership frame source-backed summaries, risks, operational overviews, briefings, and recommended next actions.",
    status: "Active",
    riskLevel: "Medium",
    responsibilities: ["Create leadership summaries", "Frame risks and next actions", "Produce operational briefings"],
    examplePrompts: ["Summarize this for the CEO", "Create a risk summary for leadership", "Prepare an executive briefing"],
    tasks: ["Executive briefing", "Risk summary", "Operational overview", "Recommended actions"],
    sources: ["Approved internal knowledge", "Source-backed operational documents", "User-provided context"],
    safetyNotes: ["Never invent operational metrics", "Should clearly state when no approved source exists"],
    tools: ["Internal knowledge retrieval", "Executive summary formatting"],
    workflows: ["Executive briefing", "Risk summary", "Operational overview"],
    implemented: true,
  },
  {
    name: "operations",
    displayName: "Operations Agent",
    icon: "⚙",
    department: "operations",
    departmentLabel: departmentLabels.operations,
    purpose:
      "Future specialist for operational playbooks, process coordination, and cross-department task planning.",
    status: "Future",
    riskLevel: "Medium",
    responsibilities: ["Coordinate operational playbooks", "Support process planning", "Prepare cross-functional task plans"],
    examplePrompts: ["Create an operations playbook outline", "Plan this cross-department process", "Summarize process risks"],
    tasks: ["Operations planning", "Process coordination", "Playbook drafting"],
    sources: ["Future operations documentation", "Approved internal process sources"],
    safetyNotes: ["Future agent; workflow actions should stay read-only until approval gates exist"],
    tools: [],
    workflows: ["Operations planning", "Process coordination"],
    implemented: false,
  },
  {
    name: "sharepoint",
    displayName: "SharePoint Agent",
    icon: "🗂",
    department: "operations",
    departmentLabel: departmentLabels.operations,
    purpose:
      "Future specialist for SharePoint content discovery, sync health summaries, and source-of-truth stewardship.",
    status: "Future",
    riskLevel: "Medium",
    responsibilities: ["Review knowledge sync health", "Summarize source inventory", "Support source-of-truth stewardship"],
    examplePrompts: ["Show sync health summary", "Which SharePoint sources are stale?", "Summarize the knowledge library inventory"],
    tasks: ["Knowledge sync review", "Content inventory", "Source stewardship"],
    sources: ["SharePoint sync metadata", "Knowledge library records", "Document source URLs"],
    safetyNotes: ["Future agent; sync actions require admin-only controls"],
    tools: [],
    workflows: ["Knowledge sync review", "Content inventory"],
    implemented: false,
  },
  {
    name: "agenda",
    displayName: "Agenda Agent",
    icon: "🗓",
    department: "operations",
    departmentLabel: departmentLabels.operations,
    purpose:
      "Future specialist for agendas, meeting prep, follow-up summaries, and operational action registers.",
    status: "Future",
    riskLevel: "Low",
    responsibilities: ["Draft meeting agendas", "Prepare follow-up lists", "Organize action registers"],
    examplePrompts: ["Create an agenda for the leadership meeting", "Summarize follow-up actions", "Draft meeting prep notes"],
    tasks: ["Agenda drafting", "Follow-up planning", "Action register preparation"],
    sources: ["Future meeting materials", "User-provided notes", "Approved agenda templates"],
    safetyNotes: ["Future agent; avoid sensitive staff or resident details in prompts"],
    tools: [],
    workflows: ["Agenda drafting", "Follow-up planning"],
    implemented: false,
  },
];
