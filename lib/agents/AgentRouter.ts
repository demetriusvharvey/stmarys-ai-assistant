import { ComplianceSurveyAgent } from "./agents/ComplianceSurveyAgent";
import { DocumentAssistantAgent } from "./agents/DocumentAssistantAgent";
import { ExecutiveAgent } from "./agents/ExecutiveAgent";
import { FacilitiesAgent } from "./agents/FacilitiesAgent";
import { FamilyCommunicationsAgent } from "./agents/FamilyCommunicationsAgent";
import { InternalKnowledgeAgent } from "./agents/InternalKnowledgeAgent";
import { ITSupportAgent } from "./agents/ITSupportAgent";
import { MedicalEducationAgent } from "./agents/MedicalEducationAgent";
import { PayrollBenefitsAgent } from "./agents/PayrollBenefitsAgent";
import { PolicyAgent } from "./agents/PolicyAgent";
import { QualityAssuranceAgent } from "./agents/QualityAssuranceAgent";
import { StaffingAgent } from "./agents/StaffingAgent";
import { TrainingEducationAgent } from "./agents/TrainingEducationAgent";
import { VendorSupplyAgent } from "./agents/VendorSupplyAgent";
import type { Agent, AgentRequest, RouteDecision } from "./types";

function matches(question: string, keywords: string[]) {
  return keywords.filter((k) => question.includes(k));
}

// ── Keyword lists ──────────────────────────────────────────────────────────

const COMPLIANCE_KEYWORDS = [
  "cms", "survey", "deficiency", "plan of correction", "state survey",
  "tag ", "f-tag", "ftag", "citation", "surveyor", "audit",
  "compliance", "regulatory", "regulation", "hipaa violation",
  "abuse", "neglect", "incident investigation", "reportable",
  "mock survey", "survey prep", "survey ready",
];

const PAYROLL_KEYWORDS = [
  "payroll", "paycheck", "direct deposit", "pay stub",
  "paylocity", "pto", "paid time off", "vacation time",
  "sick day", "sick time", "sick leave", "benefit", "benefits",
  "open enrollment", "health insurance", "dental", "vision",
  "401k", "retirement", "fsa", "hsa", "timecard", "time card",
  "missing pay", "wrong pay", "pay issue", "overtime pay",
];

const STAFFING_KEYWORDS = [
  "schedule", "scheduling", "shift", "shift coverage", "call out",
  "call-out", "no call", "no show", "overtime", "per diem",
  "agency staff", "float", "staffing", "minimum staffing",
  "on call", "on-call", "weekends", "holiday staffing",
  "coverage", "short staffed", "understaffed",
];

const TRAINING_KEYWORDS = [
  "training", "in-service", "inservice", "mandatory training",
  "annual training", "competency", "certification", "ceu",
  "continuing education", "module", "orientation", "new hire training",
  "skills check", "skills lab", "fire safety training",
  "abuse prevention training", "hipaa training",
];

const FACILITIES_KEYWORDS = [
  "maintenance", "maintenance request", "work order",
  "hvac", "heating", "cooling", "air conditioning", "heat not working",
  "water leak", "plumbing", "electrical", "light out", "broken",
  "elevator", "ceiling", "floor", "door broken", "window",
  "pest", "exterminator", "facilities", "building issue",
];

const FAMILY_COMM_KEYWORDS = [
  "family letter", "family communication", "family update",
  "letter to family", "write to family", "notify family",
  "admission letter", "discharge letter", "family notice",
  "family email", "resident family", "family meeting",
];

const QA_KEYWORDS = [
  "incident report", "incident", "fall report", "fall investigation",
  "quality assurance", "qa", "qapi", "quality improvement",
  "grievance", "complaint", "adverse event", "near miss",
  "root cause", "corrective action", "care conference",
  "pressure ulcer report", "elopement", "sentinel event",
];

const VENDOR_KEYWORDS = [
  "vendor", "supplier", "supply order", "medical supply",
  "ppe", "gloves", "masks", "gowns", "supplies",
  "laundry", "linen", "food vendor", "dietary supply",
  "purchase order", "procurement", "contract",
];

const IT_KEYWORDS = [
  "caretracker", "sigmacare", "microsoft 365", "office 365",
  "outlook", "teams", "sharepoint", "unifi", "printer",
  "scanner", "copier", "password", "login", "computer",
  "laptop", "network", "wifi", "wi-fi", "mapped drive",
  "network drive", "voicemail", "badge", "access card",
];

const DOCUMENT_KEYWORDS = [
  "draft", "write", "write an email", "professional email",
  "executive summary", "leadership summary",
  "summarize for leadership", "summarize for the ceo",
  "summarize for the cfo", "create an sop", "make an sop",
  "checklist", "template", "document this", "create a form",
];

const POLICY_KEYWORDS = [
  "policy", "sop", "procedure", "attendance",
  "handbook", "guideline", "process",
];

const EXECUTIVE_KEYWORDS = [
  "executive", "summarize for leadership", "leadership",
  "cfo", "ceo", "risk", "trend", "status",
  "overview", "recommendation", "briefing",
];

const MEDICAL_EDUCATION_KEYWORDS = [
  "dehydration", "flu", "influenza", "c diff", "c. diff",
  "hypertension", "fall prevention", "hand hygiene",
  "infection control", "health education", "medical education",
  "medication dose", "diagnose", "wound photo",
  "chest pain", "trouble breathing", "unresponsive", "seizure",
];

// ── Router ──────────────────────────────────────────────────────────────────

export class AgentRouter {
  private readonly agents: Record<string, Agent>;

  constructor() {
    const internalKnowledge = new InternalKnowledgeAgent();
    const policy = new PolicyAgent();
    const executive = new ExecutiveAgent();
    const medicalEducation = new MedicalEducationAgent();
    const itSupport = new ITSupportAgent();
    const documentAssistant = new DocumentAssistantAgent();
    const complianceSurvey = new ComplianceSurveyAgent();
    const payrollBenefits = new PayrollBenefitsAgent();
    const staffing = new StaffingAgent();
    const trainingEducation = new TrainingEducationAgent();
    const facilities = new FacilitiesAgent();
    const familyCommunications = new FamilyCommunicationsAgent();
    const qualityAssurance = new QualityAssuranceAgent();
    const vendorSupply = new VendorSupplyAgent();

    this.agents = {
      [internalKnowledge.name]: internalKnowledge,
      [policy.name]: policy,
      [executive.name]: executive,
      [medicalEducation.name]: medicalEducation,
      [itSupport.name]: itSupport,
      [documentAssistant.name]: documentAssistant,
      [complianceSurvey.name]: complianceSurvey,
      [payrollBenefits.name]: payrollBenefits,
      [staffing.name]: staffing,
      [trainingEducation.name]: trainingEducation,
      [facilities.name]: facilities,
      [familyCommunications.name]: familyCommunications,
      [qualityAssurance.name]: qualityAssurance,
      [vendorSupply.name]: vendorSupply,
    };
  }

  route(request: AgentRequest): RouteDecision {
    const q = request.question.toLowerCase();

    // Compliance/Survey — highest priority in LTC
    const complianceMatches = matches(q, COMPLIANCE_KEYWORDS);
    if (complianceMatches.length > 0) {
      return { agent: "compliance_survey", confidence: 0.85, reason: "Matched compliance, survey, or regulatory keywords.", matchedKeywords: complianceMatches };
    }

    // QA / Incident Reports
    const qaMatches = matches(q, QA_KEYWORDS);
    if (qaMatches.length > 0) {
      return { agent: "quality_assurance", confidence: 0.82, reason: "Matched quality assurance or incident report keywords.", matchedKeywords: qaMatches };
    }

    // Family communications
    const familyMatches = matches(q, FAMILY_COMM_KEYWORDS);
    if (familyMatches.length > 0) {
      return { agent: "family_communications", confidence: 0.80, reason: "Matched family communication keywords.", matchedKeywords: familyMatches };
    }

    // Document drafting (broad — check before specific topics)
    const docMatches = matches(q, DOCUMENT_KEYWORDS);
    if (docMatches.length > 0) {
      return { agent: "document_assistant", confidence: 0.75, reason: "Matched document drafting or writing keywords.", matchedKeywords: docMatches };
    }

    // IT Support
    const itMatches = matches(q, IT_KEYWORDS);
    if (itMatches.length > 0) {
      return { agent: "it_support", confidence: 0.80, reason: "Matched IT support or system keywords.", matchedKeywords: itMatches };
    }

    // Payroll & Benefits
    const payrollMatches = matches(q, PAYROLL_KEYWORDS);
    if (payrollMatches.length > 0) {
      return { agent: "payroll_benefits", confidence: 0.82, reason: "Matched payroll, benefits, or PTO keywords.", matchedKeywords: payrollMatches };
    }

    // Staffing & Scheduling
    const staffingMatches = matches(q, STAFFING_KEYWORDS);
    if (staffingMatches.length > 0) {
      return { agent: "staffing", confidence: 0.82, reason: "Matched staffing, scheduling, or shift coverage keywords.", matchedKeywords: staffingMatches };
    }

    // Training & Education
    const trainingMatches = matches(q, TRAINING_KEYWORDS);
    if (trainingMatches.length > 0) {
      return { agent: "training_education", confidence: 0.82, reason: "Matched training, in-service, or competency keywords.", matchedKeywords: trainingMatches };
    }

    // Facilities / Maintenance
    const facilitiesMatches = matches(q, FACILITIES_KEYWORDS);
    if (facilitiesMatches.length > 0) {
      return { agent: "facilities", confidence: 0.80, reason: "Matched facilities or maintenance keywords.", matchedKeywords: facilitiesMatches };
    }

    // Vendor / Supply
    const vendorMatches = matches(q, VENDOR_KEYWORDS);
    if (vendorMatches.length > 0) {
      return { agent: "vendor_supply", confidence: 0.78, reason: "Matched vendor or supply keywords.", matchedKeywords: vendorMatches };
    }

    // Policy / Handbook
    const policyMatches = matches(q, POLICY_KEYWORDS);
    if (policyMatches.length > 0) {
      return { agent: "policy", confidence: 0.80, reason: "Matched policy, SOP, procedure, or handbook keywords.", matchedKeywords: policyMatches };
    }

    // Medical education / safety refusal
    const medMatches = matches(q, MEDICAL_EDUCATION_KEYWORDS);
    if (medMatches.length > 0) {
      return { agent: "medical_education", confidence: 0.75, reason: "Matched health education or clinical safety keywords.", matchedKeywords: medMatches };
    }

    // Executive briefing
    const execMatches = matches(q, EXECUTIVE_KEYWORDS);
    if (execMatches.length > 0) {
      return { agent: "executive", confidence: 0.75, reason: "Matched executive briefing or leadership keywords.", matchedKeywords: execMatches };
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
