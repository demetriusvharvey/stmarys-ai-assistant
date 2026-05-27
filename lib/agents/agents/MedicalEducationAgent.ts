import type { Agent, AgentRequest, AgentResponse } from "../types";

const SAFE_MEDICAL_EDUCATION_KEYWORDS = [
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
];

const UNSAFE_CLINICAL_KEYWORDS = [
  "resident in room",
  "resident",
  "patient",
  "medication dose",
  "dose",
  "diagnose",
  "diagnosis",
  "wound photo",
  "chest pain",
  "trouble breathing",
  "shortness of breath",
  "unresponsive",
  "seizure",
];

const REFUSAL =
  "I can provide general health education, but I cannot provide resident-specific medical advice, diagnosis, medication guidance, or treatment decisions. Please contact the nurse, clinical leadership, provider, or emergency services if urgent.";

function findMatches(question: string, keywords: string[]) {
  return keywords.filter((keyword) => question.includes(keyword));
}

function classifyMedicalEducationRequest(question: string) {
  const normalizedQuestion = question.toLowerCase();
  const unsafeMatches = findMatches(
    normalizedQuestion,
    UNSAFE_CLINICAL_KEYWORDS
  );

  if (unsafeMatches.length > 0) {
    return {
      blocked: true,
      reason: "resident_specific_or_clinical_unsafe",
      matchedKeywords: unsafeMatches,
      residentSpecific:
        normalizedQuestion.includes("resident") ||
        normalizedQuestion.includes("patient") ||
        normalizedQuestion.includes("room"),
      urgent:
        normalizedQuestion.includes("chest pain") ||
        normalizedQuestion.includes("trouble breathing") ||
        normalizedQuestion.includes("shortness of breath") ||
        normalizedQuestion.includes("unresponsive") ||
        normalizedQuestion.includes("seizure"),
    };
  }

  return {
    blocked: false,
    reason: "general_health_education",
    matchedKeywords: findMatches(
      normalizedQuestion,
      SAFE_MEDICAL_EDUCATION_KEYWORDS
    ),
    residentSpecific: false,
    urgent: false,
  };
}

export class MedicalEducationAgent implements Agent {
  name = "medical_education" as const;
  displayName = "Medical Education Agent";
  icon = "🏥";
  mode = "medical_education" as const;

  canHandle(request: AgentRequest) {
    const question = request.question.toLowerCase();

    return (
      findMatches(question, SAFE_MEDICAL_EDUCATION_KEYWORDS).length > 0 ||
      findMatches(question, UNSAFE_CLINICAL_KEYWORDS).length > 0
    );
  }

  async answer(request: AgentRequest): Promise<AgentResponse> {
    const classification = classifyMedicalEducationRequest(request.question);
    const answer = classification.blocked
      ? REFUSAL
      : [
          "## General Health Education",
          "",
          "Educational information only — not medical advice.",
          "",
          "This is a general health education question. Approved medical source retrieval is not connected yet, so I cannot provide a source-cited medical education answer in this foundation version.",
          "",
          "For resident-specific concerns, symptoms, medication questions, diagnosis, or treatment decisions, contact the nurse, clinical leadership, provider, or emergency services if urgent.",
        ].join("\n");

    return {
      answer,
      agent: this.name,
      mode: this.mode,
      sources: [],
      safety: {
        blocked: classification.blocked,
        reason: classification.reason,
        phiDetected: classification.residentSpecific,
        residentSpecific: classification.residentSpecific,
        urgent: classification.urgent,
      },
      toolsUsed: [],
      auditMetadata: {
        displayName: this.displayName,
        icon: this.icon,
        classification: classification.reason,
        matchedKeywords: classification.matchedKeywords,
        sourceRetrievalEnabled: false,
      },
    };
  }
}
