import { DocumentAssistantAgent } from "./agents/DocumentAssistantAgent";
import { ExecutiveAgent } from "./agents/ExecutiveAgent";
import { InternalKnowledgeAgent } from "./agents/InternalKnowledgeAgent";
import { ITSupportAgent } from "./agents/ITSupportAgent";
import { MedicalEducationAgent } from "./agents/MedicalEducationAgent";
import { PolicyAgent } from "./agents/PolicyAgent";
import type { Agent, AgentRequest, RouteDecision } from "./types";

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
  "computer",
  "laptop",
  "network",
  "wifi",
  "wi-fi",
];

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
  "incident report",
  "document this",
];

const POLICY_KEYWORDS = [
  "policy",
  "sop",
  "procedure",
  "attendance",
  "handbook",
  "guideline",
  "process",
];

const EXECUTIVE_KEYWORDS = [
  "executive",
  "summarize for leadership",
  "leadership",
  "cfo",
  "ceo",
  "risk",
  "trend",
  "status",
  "overview",
  "recommendation",
  "briefing",
];

const MEDICAL_EDUCATION_KEYWORDS = [
  "what is dehydration",
  "dehydration",
  "symptoms of flu",
  "flu",
  "influenza",
  "c diff",
  "c. diff",
  "hypertension",
  "fall prevention",
  "hand hygiene",
  "infection control",
  "health education",
  "medical education",
  "resident in room",
  "resident",
  "patient",
  "medication dose",
  "diagnose",
  "wound photo",
  "chest pain",
  "trouble breathing",
  "unresponsive",
  "seizure",
];

function findMatches(question: string, keywords: string[]) {
  return keywords.filter((keyword) => question.includes(keyword));
}

export class AgentRouter {
  private readonly agents: Record<string, Agent>;

  constructor() {
    const internalKnowledgeAgent = new InternalKnowledgeAgent();
    const policyAgent = new PolicyAgent();
    const executiveAgent = new ExecutiveAgent();
    const medicalEducationAgent = new MedicalEducationAgent();
    const itSupportAgent = new ITSupportAgent();
    const documentAssistantAgent = new DocumentAssistantAgent();

    this.agents = {
      [internalKnowledgeAgent.name]: internalKnowledgeAgent,
      [policyAgent.name]: policyAgent,
      [executiveAgent.name]: executiveAgent,
      [medicalEducationAgent.name]: medicalEducationAgent,
      [itSupportAgent.name]: itSupportAgent,
      [documentAssistantAgent.name]: documentAssistantAgent,
    };
  }

  route(request: AgentRequest): RouteDecision {
    const question = request.question.toLowerCase();
    const documentMatches = findMatches(question, DOCUMENT_KEYWORDS);

    if (documentMatches.length > 0) {
      return {
        agent: "document_assistant",
        confidence: 0.75,
        reason: "Matched document drafting, writing, or summarization keywords.",
        matchedKeywords: documentMatches,
      };
    }

    const itMatches = findMatches(question, IT_KEYWORDS);

    if (itMatches.length > 0) {
      return {
        agent: "it_support",
        confidence: 0.75,
        reason: "Matched IT support or troubleshooting keywords.",
        matchedKeywords: itMatches,
      };
    }

    const policyMatches = findMatches(question, POLICY_KEYWORDS);

    if (policyMatches.length > 0) {
      return {
        agent: "policy",
        confidence: 0.8,
        reason: "Matched policy, SOP, procedure, attendance, handbook, guideline, or process keywords.",
        matchedKeywords: policyMatches,
      };
    }

    const medicalMatches = findMatches(question, MEDICAL_EDUCATION_KEYWORDS);

    if (medicalMatches.length > 0) {
      return {
        agent: "medical_education",
        confidence: 0.75,
        reason: "Matched general medical education or unsafe clinical/resident-specific keywords.",
        matchedKeywords: medicalMatches,
      };
    }

    const executiveMatches = findMatches(question, EXECUTIVE_KEYWORDS);

    if (executiveMatches.length > 0) {
      return {
        agent: "executive",
        confidence: 0.75,
        reason: "Matched leadership, executive briefing, trend, risk, status, overview, or recommendation keywords.",
        matchedKeywords: executiveMatches,
      };
    }

    return {
      agent: "internal_knowledge",
      confidence: 0.5,
      reason: "No specialized route matched; using internal knowledge default.",
      matchedKeywords: [],
    };
  }

  getAgent(decision: RouteDecision) {
    return this.agents[decision.agent];
  }
}
