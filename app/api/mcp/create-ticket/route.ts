import { NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/mcp/auth";
import { IssuetrakClient } from "@/lib/integrations/issuetrak/client";
import { resolveCategory } from "@/lib/integrations/issuetrak/categoryResolver";
import { deIdentifyText } from "@/lib/phi/deidentify";

export const runtime = "nodejs";

const client = new IssuetrakClient();

export async function POST(req: Request) {
  if (!verifyInternalSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { subject, description, requesterEmail, requesterName, locationUnit, priority } = body;

    if (!subject || !description || !requesterEmail || !locationUnit) {
      return NextResponse.json(
        { error: "Missing required fields: subject, description, requesterEmail, locationUnit" },
        { status: 400 }
      );
    }

    const { cleanText: cleanSubject } = deIdentifyText(subject);
    const { cleanText: cleanDesc } = deIdentifyText(description);
    const category = resolveCategory(\`\${cleanSubject} \${cleanDesc}\`).category;

    const result = await client.createIssue({
      subject: cleanSubject,
      description: cleanDesc,
      requesterEmail,
      requesterName: requesterName || "St. Mary's Staff",
      locationUnit,
      category,
      priority: priority || "normal",
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
