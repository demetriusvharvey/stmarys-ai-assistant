import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = "http://localhost:3000/api/ai-tools";
const INTERNAL_ADMIN_SECRET = process.env.INTERNAL_ADMIN_SECRET;

function apiHeaders() {
  return {
    "Content-Type": "application/json",
    ...(INTERNAL_ADMIN_SECRET
      ? { "x-internal-admin-secret": INTERNAL_ADMIN_SECRET }
      : {}),
  };
}

const server = new McpServer({
  name: "stmarys-ai-assistant",
  version: "1.0.0",
});

server.tool(
  "knowledge_search",
  "Search the St. Mary's knowledge base",
  {
    query: z.string(),
    limit: z.number().optional(),
  },
  async ({ query, limit = 5 }) => {
    const res = await fetch(`${API_BASE}/search-knowledge`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        query,
        limit,
      }),
    });

    const data = await res.json();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "answer_question",
  "Answer questions using the St. Mary's knowledge base",
  {
    question: z.string(),
  },
  async ({ question }) => {
    const res = await fetch(`${API_BASE}/answer-question`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        question,
      }),
    });

    const data = await res.json();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "sync_status",
  "Get SharePoint ingestion sync status",
  {},
  async () => {
    const res = await fetch(`${API_BASE}/sync-status`, {
      headers: apiHeaders(),
    });

    const data = await res.json();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "open_document",
  "Open a document from the knowledge base",
  {
    documentId: z.string(),
  },
  async ({ documentId }) => {
    const res = await fetch(
      `${API_BASE}/open-document?documentId=${documentId}`,
      {
        headers: apiHeaders(),
      }
    );

    const data = await res.json();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("St. Mary's MCP Server running...");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
