import { answerQuestion } from "@/lib/ai/answerQuestion";
import { getMedicalContext } from "@/lib/integrations/medical";
import type { Agent, AgentRequest, AgentResponse } from "../types";

const UNSAFE_CLINICAL_KEYWORDS = [
  "resident in room", "this resident", "my resident", "my patient",
  "diagnose", "diagnosis", "wound photo",
  "chest pain", "trouble breathing", "shortness of breath",
  "unresponsive", "seizure", "not breathing",
];

const REFUSAL =
  "## Medical Safety\n\nI can provide general health education, but I cannot provide resident-specific medical advice, diagnosis, or treatment decisions.\n\nIf this is urgent, contact the charge nurse or call 911.";

function isUnsafe(question: string): { blocked: boolean; urgent: boolean; residentSpecific: boolean } {
  const q = question.toLowerCase();
  const matched = UNSAFE_CLINICAL_KEYWORDS.filter(k => q.includes(k));
  const urgent = ["chest pain", "trouble breathing", "shortness of breath", "unresponsive", "seizure", "not breathing"]
    .some(k => q.includes(k));
  const residentSpecific = ["resident", "patient", "room"].some(k => q.includes(k)) && matched.length > 0;
  return { blocked: matched.length > 0, urgent, residentSpecific };
}

export class MedicalEducationAgent implements Agent {
  name = "medical_education" as const;
  displayName = "Medical Education Agent";
  icon = "🏥";
  mode = "medical_education" as const;

  canHandle(_request: AgentRequest) {
    return false;
  }

  async answer(request: AgentRequest): Promise<AgentResponse> {
    const safety = isUnsafe(request.question);
    const toolsUsed: AgentResponse["toolsUsed"] = [];

    if (safety.blocked) {
      return {
        answer: REFUSAL,
        agent: this.name,
        mode: this.mode,
        sources: [],
        safety: { blocked: true, phiDetected: safety.residentSpecific, residentSpecific: safety.residentSpecific, urgent: safety.urgent },
        toolsUsed: [],
        auditMetadata: { displayName: this.displayName, icon: this.icon },
      };
    }

    // 1. Try live medical APIs (OpenFDA, MedlinePlus, RxNorm)
    let liveContext = "";
    const liveSources: string[] = [];

    try {
      const medical = await getMedicalContext(request.question);
      if (medical) {
        liveContext = `\n\n---\n### 🔬 Live Medical Reference (${medical.type === "drug" ? "FDA / RxNorm" : "MedlinePlus / NIH"})\n\n${medical.content}`;
        liveSources.push(...medical.sources);
        toolsUsed.push({
          toolName: medical.type === "drug" ? "openFDA + RxNorm" : "MedlinePlus",
          success: true,
          inputSummary: request.question.slice(0, 100),
          outputSummary: `Live ${medical.type} data retrieved.`,
        });
      }
    } catch (err: any) {
      toolsUsed.push({
        toolName: "medicalAPI",
        success: false,
        inputSummary: request.question.slice(0, 100),
        outputSummary: err.message,
      });
    }

    // 2. Internal knowledge base (our seeded documents)
    const result = await answerQuestion({
      question: request.question,
      userEmail: request.user?.email || request.userEmail || null,
      conversationId: request.conversationId || null,
      conversationHistory: request.conversationHistory,
      audit: false,
    });

    toolsUsed.push({
      toolName: "answerQuestion",
      success: true,
      inputSummary: "Medical education knowledge lookup.",
      outputSummary: result.verification.answerMode,
    });

    const disclaimer = "\n\n> ⚕️ **This is general health education, not medical advice.** For resident-specific concerns, contact nursing or clinical leadership.";
    const answer = result.answer + liveContext + disclaimer;

    return {
      answer,
      agent: this.name,
      mode: this.mode,
      sources: [
        ...result.sources.map(s => ({
          id: s.id,
          documentId: s.documentId,
          title: s.title,
          category: s.category,
          source: s.source,
          sourceUrl: s.sourceUrl,
          similarity: s.similarity,
        })),
        ...liveSources.map((src, i) => ({
          id: `live-${i}`,
          documentId: `live-${i}`,
          title: src,
          category: "Medical / Public",
          source: src,
          sourceUrl: "",
          similarity: 1,
        })),
      ],
      safety: { blocked: false, phiDetected: false, residentSpecific: false, urgent: false },
      toolsUsed,
      auditMetadata: {
        displayName: this.displayName,
        icon: this.icon,
        liveAPIUsed: liveContext.length > 0,
        answerMode: result.verification.answerMode,
      },
    };
  }
}
