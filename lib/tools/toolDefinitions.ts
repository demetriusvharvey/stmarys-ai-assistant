import type { ToolDefinition } from "./types";
import { openai } from "@/lib/openai";

async function stubRun() {
  return {
    stub: true,
    message: "Tool is registered but not implemented yet.",
  };
}

async function draftDocumentRun(input: unknown) {
  const prompt =
    typeof input === "string"
      ? input
      : typeof input === "object" && input && "prompt" in input
        ? String((input as { prompt?: unknown }).prompt || "")
        : "";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You draft practical internal operations documents for St. Mary's staff.

Start every response with exactly this markdown heading:
## Generated Draft

Create editable drafts only. Do not present drafts as approved policy.
Return only the document requested by the current user prompt. Do not bundle unrelated emails, SOPs, checklists, summaries, or examples into the same response.
Do not invent St. Mary's official policy details, required approvals, deadlines, penalties, clinical rules, or final authority.
If the user asks for official policy language and no source text is provided, state that the draft should be verified against approved St. Mary's policy before use.
Use professional, concise wording.
For SOPs, include purpose, scope, prerequisites, procedure, escalation, and review fields.
For onboarding checklists, group items by timing or workstream and include owners/placeholders.
For emails, write clear subject and body text.
For executive summaries, use short decision-oriented bullets with risks and next actions.
        `.trim(),
      },
      {
        role: "user",
        content: prompt || "Create a concise internal draft.",
      },
    ],
    temperature: 0.35,
  });

  return {
    draft: completion.choices[0]?.message?.content || "",
  };
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "searchInternalKnowledge",
    description: "Search approved internal St. Mary's knowledge.",
    readOnly: true,
    risk: "low",
    allowedAgents: ["internal_knowledge", "document_assistant", "it_support"],
    allowedRoles: ["staff", "it_staff", "admin", "service"],
    requiresConfirmation: false,
    run: stubRun,
  },
  {
    name: "openInternalDocument",
    description: "Open an approved internal knowledge document.",
    readOnly: true,
    risk: "low",
    allowedAgents: ["internal_knowledge", "document_assistant", "it_support"],
    allowedRoles: ["staff", "it_staff", "admin", "service"],
    requiresConfirmation: false,
    run: stubRun,
  },
  {
    name: "searchITKnowledge",
    description: "Search IT support knowledge and troubleshooting material.",
    readOnly: true,
    risk: "medium",
    allowedAgents: ["it_support"],
    allowedRoles: ["it_staff", "admin"],
    requiresConfirmation: false,
    run: stubRun,
  },
  {
    name: "getSyncStatus",
    description: "Read SharePoint ingestion sync status.",
    readOnly: true,
    risk: "medium",
    allowedAgents: ["it_support"],
    allowedRoles: ["it_staff", "admin"],
    requiresConfirmation: false,
    run: stubRun,
  },
  {
    name: "draftDocument",
    description: "Draft text such as SOPs, emails, checklists, or summaries.",
    readOnly: true,
    risk: "low",
    allowedAgents: ["document_assistant"],
    allowedRoles: ["staff", "it_staff", "admin"],
    requiresConfirmation: false,
    run: draftDocumentRun,
  },
];
