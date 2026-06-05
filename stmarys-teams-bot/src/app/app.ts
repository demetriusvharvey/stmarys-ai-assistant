import { App } from "@microsoft/teams.apps";
import { LocalStorage } from "@microsoft/teams.common";
import { MessageActivity, TokenCredentials } from "@microsoft/teams.api";
import { ManagedIdentityCredential } from "@azure/identity";
import config from "../config";

const storage = new LocalStorage();
const AI_API_URL = process.env.STMARYS_AI_API_URL || "http://localhost:3000/api/ai-tools/answer-question";
const IT_CONTACT = "infotechsupport@smhdc.org | ext. 5800";

type AgentMeta = { name: string; displayName: string; icon: string; reason?: string };
type TeamsIdentity = {
  channel: "teams";
  teamsUserId?: string; aadObjectId?: string; email?: string;
  displayName?: string; tenantId?: string; conversationId?: string;
};
type AnswerResponse = {
  success: boolean; answer?: string; selectedAgent?: AgentMeta;
  sources?: { title: string; sourceUrl: string | null; similarity: number }[];
  error?: string;
};

const createTokenFactory = () =>
  async (scope: string | string[], tenantId?: string): Promise<string> => {
    const cred = new ManagedIdentityCredential({ clientId: process.env.CLIENT_ID });
    const scopes = Array.isArray(scope) ? scope : [scope];
    return (await cred.getToken(scopes, { tenantId })).token;
  };

const tokenCredentials: TokenCredentials = {
  clientId: process.env.CLIENT_ID || "",
  token: createTokenFactory(),
};

const app = new App({
  ...(config.MicrosoftAppType === "UserAssignedMsi" ? tokenCredentials : {}),
  storage,
});

async function askStMarysAI(question: string, identity?: TeamsIdentity): Promise<AnswerResponse> {
  const res = await fetch(AI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.INTERNAL_ADMIN_SECRET ? { "x-internal-admin-secret": process.env.INTERNAL_ADMIN_SECRET } : {}),
    },
    body: JSON.stringify({ question, identity }),
    signal: AbortSignal.timeout(25_000),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || "AI backend error.");
  return data;
}

function formatSources(sources: AnswerResponse["sources"] = []): string {
  if (!sources.length) return "";
  const lines = sources.slice(0, 3).map((s, i) =>
    s.sourceUrl ? `${i + 1}. [${s.title}](${s.sourceUrl})` : `${i + 1}. ${s.title}`
  );
  return `\n\n---\n**Sources**\n${lines.join("\n")}`;
}

function cleanQuestion(text?: string): string {
  return (text || "").replace(/<[^>]*>/g, "").trim();
}

function isMetaQuestion(q: string): boolean {
  const l = q.toLowerCase().trim();
  return l === "help" || l.includes("what can you do") || l.includes("what agents") ||
    l.includes("how can you help") || l.includes("what do you do") || l === "capabilities";
}

function getMetaAnswer(): string {
  return `**St. Mary's AI Workforce** has 14 specialized agents:\n\n` +
    `📋 **Policy** — policies, SOPs, procedures, handbook\n` +
    `🖥 **IT Support** — troubleshooting + Issuetrak tickets\n` +
    `👥 **HR** — drafts, onboarding checklists, templates\n` +
    `💰 **Payroll & Benefits** — PTO, Paylocity, benefits\n` +
    `🗓 **Staffing** — schedules, call-outs, shift coverage\n` +
    `🎓 **Training** — mandatory training, in-service\n` +
    `✅ **Compliance** — CMS surveys, F-tags, plan of correction\n` +
    `📊 **Executive** — leadership briefings and summaries\n` +
    `🏥 **Medical Education** — general health education\n` +
    `🔧 **Facilities** — maintenance requests, HVAC\n` +
    `💌 **Family Comms** — family letters and notices\n` +
    `📈 **QA** — incident reports, QAPI, grievances\n` +
    `📦 **Vendor & Supply** — supply orders, vendor contacts\n` +
    `🔍 **Knowledge** — general internal knowledge base\n\n` +
    `**Try:** "What is the attendance policy?" or "Submit an IT ticket for a broken printer in Area 2"`;
}

app.on("message", async ({ send, activity }) => {
  const question = cleanQuestion(activity.text);

  if (!question) {
    await send("Hi! Ask me anything about St. Mary's policies, IT, HR, compliance, or operations. Type **help** to see all agents.");
    return;
  }

  if (isMetaQuestion(question)) {
    await send(new MessageActivity(getMetaAnswer()).addAiGenerated());
    return;
  }

  const from = activity.from as any;
  const conversation = activity.conversation as any;
  const identity: TeamsIdentity = {
    channel: "teams",
    teamsUserId: from?.id,
    aadObjectId: from?.aadObjectId,
    email: from?.userPrincipalName,
    displayName: from?.name,
    tenantId: conversation?.tenantId,
    conversationId: conversation?.id,
  };

  await send(new MessageActivity("_Searching St. Mary's knowledge base…_"));

  try {
    const result = await askStMarysAI(question, identity);
    const answer = result.answer || "I could not generate an answer from the approved knowledge base.";
    const sources = formatSources(result.sources);
    const agentTag = result.selectedAgent
      ? `\n\n*${result.selectedAgent.icon ?? ""} ${result.selectedAgent.displayName}*`
      : "";

    await send(new MessageActivity(`${answer}${sources}${agentTag}`).addAiGenerated().addFeedback());
  } catch (err: any) {
    const isTimeout = err.name === "TimeoutError" || String(err.message).includes("timeout");
    const msg = isTimeout
      ? `The request timed out. Please try again or contact IT: ${IT_CONTACT}`
      : `Something went wrong. Please try again or contact IT: ${IT_CONTACT}`;
    console.error("[Teams bot]", err);
    await send(new MessageActivity(msg));
  }
});

app.on("message.submit.feedback", async ({ activity }) => {
  console.log("[Teams bot] Feedback:", JSON.stringify(activity.value));
});

export default app;
