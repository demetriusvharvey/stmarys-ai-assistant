import { DocumentAssistantAgent } from "./agents/DocumentAssistantAgent";
import { InternalKnowledgeAgent } from "./agents/InternalKnowledgeAgent";
import { ITSupportAgent } from "./agents/ITSupportAgent";
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

function findMatches(question: string, keywords: string[]) {
  return keywords.filter((keyword) => question.includes(keyword));
}

export class AgentRouter {
  private readonly agents: Record<string, Agent>;

  constructor() {
    const internalKnowledgeAgent = new InternalKnowledgeAgent();
    const itSupportAgent = new ITSupportAgent();
    const documentAssistantAgent = new DocumentAssistantAgent();

    this.agents = {
      [internalKnowledgeAgent.name]: internalKnowledgeAgent,
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
