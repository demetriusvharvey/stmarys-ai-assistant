/**
 * Medical Knowledge Router
 * Detects what kind of medical query it is and routes to the right API
 */

import { searchDrug, searchDrugRecalls } from "./openFDA";
import { searchHealthTopic, lookupDrugRxNorm, getDrugInteractions } from "./medlinePlus";

export type MedicalContext = {
  type: "drug" | "condition" | "general";
  content: string;
  sources: string[];
};

// Keywords that suggest a drug/medication question
const DRUG_KEYWORDS = [
  "medication", "medicine", "drug", "dose", "dosage", "mg ", "tablet", "pill",
  "prescription", "side effect", "interaction", "overdose", "adverse", "recall",
  "antibiotic", "insulin", "metformin", "lisinopril", "atorvastatin", "amlodipine",
  "metoprolol", "omeprazole", "aspirin", "tylenol", "ibuprofen", "acetaminophen",
  "warfarin", "lasix", "furosemide", "gabapentin", "sertraline", "lorazepam",
];

// Keywords that suggest a health condition question
const CONDITION_KEYWORDS = [
  "symptom", "condition", "disease", "diagnosis", "treatment", "therapy",
  "infection", "diabetes", "hypertension", "dementia", "alzheimer", "stroke",
  "pneumonia", "sepsis", "dehydration", "pressure ulcer", "fall", "fracture",
  "copd", "heart failure", "kidney", "uti", "urinary", "wound", "pain",
  "fever", "blood pressure", "glucose", "oxygen", "saturation",
];

function detectQueryType(question: string): "drug" | "condition" | "general" {
  const q = question.toLowerCase();
  if (DRUG_KEYWORDS.some(k => q.includes(k))) return "drug";
  if (CONDITION_KEYWORDS.some(k => q.includes(k))) return "condition";
  return "general";
}

// Extract likely drug/condition name from question
function extractSubject(question: string): string {
  // Remove common question words to get to the subject
  return question
    .replace(/what (is|are|does|do|about)/gi, "")
    .replace(/how (do|does|should|to)/gi, "")
    .replace(/tell me about/gi, "")
    .replace(/information (on|about)/gi, "")
    .replace(/side effects of/gi, "")
    .replace(/dosage for/gi, "")
    .replace(/can (i|we|you)/gi, "")
    .replace(/\?/g, "")
    .trim()
    .slice(0, 80);
}

export async function getMedicalContext(question: string): Promise<MedicalContext | null> {
  const type = detectQueryType(question);
  const subject = extractSubject(question);

  if (type === "drug") {
    const [drugInfo, recalls] = await Promise.all([
      searchDrug(subject),
      searchDrugRecalls(subject),
    ]);

    // Also try RxNorm for interactions
    let interactions: string[] = [];
    if (drugInfo) {
      const rxDrug = await lookupDrugRxNorm(drugInfo.genericName || drugInfo.name);
      if (rxDrug) {
        interactions = await getDrugInteractions(rxDrug.rxcui);
      }
    }

    if (!drugInfo && recalls.length === 0) return null;

    const parts: string[] = [];
    const sources: string[] = [];

    if (drugInfo) {
      parts.push(`**${drugInfo.name || subject}** (${drugInfo.genericName || ""})`);
      if (drugInfo.purpose) parts.push(`**Purpose:** ${drugInfo.purpose}`);
      if (drugInfo.usage) parts.push(`**Usage:** ${drugInfo.usage}`);
      if (drugInfo.dosage) parts.push(`**Dosage:** ${drugInfo.dosage}`);
      if (drugInfo.warnings) parts.push(`**Warnings:** ${drugInfo.warnings}`);
      if (drugInfo.interactions) parts.push(`**Drug Interactions:** ${drugInfo.interactions}`);
      if (drugInfo.adverseReactions) parts.push(`**Adverse Reactions:** ${drugInfo.adverseReactions}`);
      sources.push(drugInfo.source);
    }

    if (interactions.length > 0) {
      parts.push(`**Known Interactions (RxNorm):**\n${interactions.map(i => `• ${i}`).join("\n")}`);
      sources.push("RxNorm (NLM Drug Interaction API)");
    }

    if (recalls.length > 0) {
      parts.push(`**Recent FDA Recalls:**\n${recalls.join("\n")}`);
      sources.push("OpenFDA Drug Enforcement (Recalls)");
    }

    return { type: "drug", content: parts.join("\n\n"), sources };
  }

  if (type === "condition") {
    const topic = await searchHealthTopic(subject);
    if (!topic) return null;

    return {
      type: "condition",
      content: `**${topic.title}**\n\n${topic.summary}\n\n[Read more on MedlinePlus](${topic.url})`,
      sources: [topic.source],
    };
  }

  return null;
}
