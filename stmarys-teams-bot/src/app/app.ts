import { App } from "@microsoft/teams.apps";
import { LocalStorage } from "@microsoft/teams.common";
import { MessageActivity, TokenCredentials } from "@microsoft/teams.api";
import { ManagedIdentityCredential } from "@azure/identity";
import config from "../config";

const storage = new LocalStorage();

const AI_API_URL =
  process.env.STMARYS_AI_API_URL ||
  "http://localhost:3000/api/ai-tools/answer-question";

type AnswerQuestionResponse = {
  success: boolean;
  question?: string;
  answer?: string;
  retrievedChunks?: number;
  sources?: {
    chunkId: string;
    documentId: string;
    title: string;
    category: string;
    source: string;
    sourceUrl: string;
    externalId: string;
    similarity: number;
    chunkIndex: number | null;
  }[];
  error?: string;
};

const createTokenFactory = () => {
  return async (scope: string | string[], tenantId?: string): Promise<string> => {
    const managedIdentityCredential = new ManagedIdentityCredential({
      clientId: process.env.CLIENT_ID,
    });

    const scopes = Array.isArray(scope) ? scope : [scope];

    const tokenResponse = await managedIdentityCredential.getToken(scopes, {
      tenantId,
    });

    return tokenResponse.token;
  };
};

const tokenCredentials: TokenCredentials = {
  clientId: process.env.CLIENT_ID || "",
  token: createTokenFactory(),
};

const credentialOptions =
  config.MicrosoftAppType === "UserAssignedMsi"
    ? { ...tokenCredentials }
    : undefined;

const app = new App({
  ...credentialOptions,
  storage,
});

async function askStMarysAI(question: string): Promise<AnswerQuestionResponse> {
  const response = await fetch(AI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question,
      limit: 6,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "St. Mary's AI backend returned an error.");
  }

  return data;
}

function formatSources(sources: AnswerQuestionResponse["sources"] = []) {
  if (!sources.length) return "";

  const topSources = sources.slice(0, 4);

  const lines = topSources.map((source, index) => {
    const match = Math.round(Number(source.similarity || 0) * 100);
    const title = source.title || "Untitled document";
    const category = source.category || "Unknown";

    if (source.sourceUrl) {
      return `${index + 1}. [${title}](${source.sourceUrl}) — ${category}, match ${match}%`;
    }

    return `${index + 1}. ${title} — ${category}, match ${match}%`;
  });

  return `\n\n**Sources**\n${lines.join("\n")}`;
}

function cleanQuestion(text?: string) {
  return (text || "").replace(/<[^>]*>/g, "").trim();
}

app.on("message", async ({ send, activity }) => {
  const question = cleanQuestion(activity.text);

  if (!question) {
    await send("Please ask a question about St. Mary’s approved knowledge.");
    return;
  }

  try {
    await send("Searching St. Mary’s knowledge base...");

    const result = await askStMarysAI(question);

    const answer =
      result.answer ||
      "I could not generate an answer from the approved knowledge base.";

    const sourceText = formatSources(result.sources);

    const responseActivity = new MessageActivity(
      `${answer}${sourceText}`
    )
      .addAiGenerated()
      .addFeedback();

    await send(responseActivity);
  } catch (error: any) {
    console.error("Teams bot error:", error);

    await send(
      `The St. Mary’s AI assistant encountered an error: ${
        error.message || "Unknown error"
      }`
    );
  }
});

app.on("message.submit.feedback", async ({ activity }) => {
  console.log("Feedback:", JSON.stringify(activity.value));
});

export default app;