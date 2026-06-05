import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const APP_BASE = process.env.STMARYS_APP_URL || "http://10.10.5.193:3000";
const AI_BASE  = `${APP_BASE}/api/ai-tools`;
const MCP_BASE = `${APP_BASE}/api/mcp`;
const INTERNAL_ADMIN_SECRET = process.env.INTERNAL_ADMIN_SECRET;

function headers() {
  return {
    "Content-Type": "application/json",
    ...(INTERNAL_ADMIN_SECRET ? { "x-internal-admin-secret": INTERNAL_ADMIN_SECRET } : {}),
  };
}

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const server = new McpServer({
  name: "stmarys-ai-assistant",
  version: "2.0.0",
});

// ─── Knowledge & AI ──────────────────────────────────────────────────────────

server.tool(
  "knowledge_search",
  "Search the St. Mary's internal knowledge base for policies, procedures, and documents.",
  { query: z.string(), limit: z.number().optional() },
  async ({ query, limit = 5 }) => {
    const res = await fetch(`${AI_BASE}/search-knowledge`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ query, limit }),
    });
    return text(await res.json());
  }
);

server.tool(
  "answer_question",
  "Get an AI-powered answer from the St. Mary's knowledge base. Use for policy questions, procedures, IT guidance.",
  { question: z.string() },
  async ({ question }) => {
    const res = await fetch(`${AI_BASE}/answer-question`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ question }),
    });
    return text(await res.json());
  }
);

server.tool(
  "open_document",
  "Retrieve the full text of a specific document from the knowledge base by its ID.",
  { documentId: z.string() },
  async ({ documentId }) => {
    const res = await fetch(`${AI_BASE}/open-document?documentId=${encodeURIComponent(documentId)}`, {
      headers: headers(),
    });
    return text(await res.json());
  }
);

server.tool(
  "sync_status",
  "Check the status of the SharePoint document ingestion sync — last run time, document counts, any errors.",
  {},
  async () => {
    const res = await fetch(`${AI_BASE}/sync-status`, { headers: headers() });
    return text(await res.json());
  }
);

// ─── Audit Logs ───────────────────────────────────────────────────────────────

server.tool(
  "get_audit_log",
  "Query the St. Mary's AI activity audit log. See what questions staff have been asking, filter by user or keyword. Useful for usage reports and accountability reviews.",
  {
    userEmail: z.string().optional().describe("Filter by staff email address (partial match)"),
    search:    z.string().optional().describe("Search within question text"),
    limit:     z.number().optional().describe("Max number of records to return (default 25, max 100)"),
  },
  async ({ userEmail, search, limit = 25 }) => {
    const params = new URLSearchParams();
    if (userEmail) params.set("userEmail", userEmail);
    if (search)    params.set("search", search);
    params.set("limit", String(limit));
    const res = await fetch(`${MCP_BASE}/audit-logs?${params}`, { headers: headers() });
    return text(await res.json());
  }
);

// ─── User Management ─────────────────────────────────────────────────────────

server.tool(
  "get_user_list",
  "Get a list of all St. Mary's AI Workforce staff accounts — name, email, role, active status, last login.",
  {},
  async () => {
    const res = await fetch(`${MCP_BASE}/users`, { headers: headers() });
    return text(await res.json());
  }
);

// ─── IT Ticket Creation ───────────────────────────────────────────────────────

server.tool(
  "create_ticket",
  "Submit an IT support ticket to Issuetrak on behalf of a staff member. Currently in dry-run mode — tickets are logged but not submitted until the Issuetrak API is enabled.",
  {
    subject:        z.string().describe("Short title of the issue (5-120 chars)"),
    description:    z.string().describe("Full description of the problem"),
    requesterEmail: z.string().describe("Email of the staff member reporting the issue"),
    requesterName:  z.string().optional().describe("Display name of the staff member"),
    locationUnit:   z.string().describe("Which unit, floor, or area they are in"),
    priority:       z.enum(["normal", "high", "urgent"]).optional().describe("Ticket priority (default: normal)"),
  },
  async ({ subject, description, requesterEmail, requesterName, locationUnit, priority }) => {
    const res = await fetch(`${MCP_BASE}/create-ticket`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ subject, description, requesterEmail, requesterName, locationUnit, priority }),
    });
    return text(await res.json());
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("St. Mary's MCP Server v2.0 running...");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
