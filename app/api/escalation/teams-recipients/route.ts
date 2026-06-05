import { NextRequest, NextResponse } from "next/server";
import { getGraphAccessToken } from "@/lib/microsoftGraph";
import { getSession } from "@/lib/session";

type GraphGroup = {
  id: string;
  displayName?: string;
  mail?: string;
};

type GraphUser = {
  mail?: string | null;
  userPrincipalName?: string | null;
  accountEnabled?: boolean | null;
};

async function graphGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph request failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}

function getEscalationGroupEmail(team: string | null) {
  const normalizedTeam = (team || "").toLowerCase();

  if (normalizedTeam === "it_support" || normalizedTeam.includes("it")) {
    return process.env.SMH_IT_SUPPORT_TEAMS_GROUP_EMAIL || "itdepartment@smhdc.org";
  }

  return null;
}

function getFallbackRecipients(team: string | null) {
  const normalizedTeam = (team || "").toLowerCase();

  if (normalizedTeam === "it_support" || normalizedTeam.includes("it")) {
    return [
      "APancho@smhdc.org",
      "dharvey@smhdc.org",
      "pparker@smhdc.org",
      "waung@smhdc.org",
    ];
  }

  return [];
}

function getExcludedRecipients(team: string | null) {
  const normalizedTeam = (team || "").toLowerCase();

  if (normalizedTeam === "it_support" || normalizedTeam.includes("it")) {
    return new Set(["kpearl@smhdc.org"]);
  }

  return new Set<string>();
}

function normalizeRecipients(recipients: string[], excludedRecipients: Set<string>) {
  return [...new Set(
    recipients
      .map((email) => email.trim())
      .filter((email) => email.includes("@"))
      .filter((email) => !excludedRecipients.has(email.toLowerCase()))
  )];
}

export async function GET(req: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const team = req.nextUrl.searchParams.get("team");
  const groupEmail = getEscalationGroupEmail(team);
  const excludedRecipients = getExcludedRecipients(team);
  const fallbackRecipients = getFallbackRecipients(team);

  if (!groupEmail) {
    return NextResponse.json({ recipients: [], source: "no_supported_group" });
  }

  try {
    const token = await getGraphAccessToken();
    const escapedEmail = groupEmail.replace(/'/g, "''");
    const groupParams = new URLSearchParams({
      "$filter": `mail eq '${escapedEmail}'`,
      "$select": "id,displayName,mail",
    });
    const groupResult = await graphGet<{ value: GraphGroup[] }>(
      `https://graph.microsoft.com/v1.0/groups?${groupParams.toString()}`,
      token
    );
    const group = groupResult.value[0];

    if (!group) {
      return NextResponse.json({
        recipients: [],
        source: "group_not_found",
        groupEmail,
      });
    }

    const members = await graphGet<{ value: GraphUser[] }>(
      `https://graph.microsoft.com/v1.0/groups/${group.id}/members/microsoft.graph.user?$select=mail,userPrincipalName,accountEnabled&$top=50`,
      token
    );
    const recipients = normalizeRecipients(members.value
      .filter((member) => member.accountEnabled !== false)
      .map((member) => member.mail || member.userPrincipalName)
      .filter((email): email is string => Boolean(email && email.includes("@"))),
      excludedRecipients
    );

    return NextResponse.json({
      recipients: recipients.length > 0
        ? recipients
        : normalizeRecipients(fallbackRecipients, excludedRecipients),
      source: recipients.length > 0
        ? "microsoft_graph_group_members"
        : "fallback_configured_it_recipients",
      groupEmail,
      groupDisplayName: group.displayName || null,
    });
  } catch (error) {
    console.error("[teams-recipients] Failed to resolve group members", error);

    return NextResponse.json(
      {
        recipients: normalizeRecipients(fallbackRecipients, excludedRecipients),
        source: fallbackRecipients.length > 0
          ? "fallback_configured_it_recipients"
          : "graph_lookup_failed",
        groupEmail,
      },
      { status: 200 }
    );
  }
}
