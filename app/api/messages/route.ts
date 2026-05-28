import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ success: false, error: "Missing conversationId" }, { status: 400 });
  }

  try {
    // Verify conversation belongs to this user
    const conv = await db.query(
      `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, session.id]
    );
    if (conv.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const result = await db.query(
      `SELECT id, conversation_id, role, content, sources, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );
    return NextResponse.json({ success: true, messages: result.rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { conversationId, role, content, sources } = body;

    if (!conversationId || !role || !content) {
      return NextResponse.json({ success: false, error: "conversationId, role, and content are required" }, { status: 400 });
    }
    if (!["user", "assistant"].includes(role)) {
      return NextResponse.json({ success: false, error: "Invalid role" }, { status: 400 });
    }

    // Verify ownership
    const conv = await db.query(
      `SELECT id FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, session.id]
    );
    if (conv.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const result = await db.query(
      `INSERT INTO messages (conversation_id, role, content, sources)
       VALUES ($1, $2, $3, $4)
       RETURNING id, conversation_id, role, content, sources, created_at`,
      [conversationId, role, content, sources ? JSON.stringify(sources) : null]
    );

    await db.query(
      `UPDATE conversations
       SET updated_at = now(),
           title = CASE
             WHEN title = 'New Chat' AND $2 = 'user' THEN LEFT($3, 60)
             ELSE title
           END
       WHERE id = $1`,
      [conversationId, role, content]
    );

    return NextResponse.json({ success: true, message: result.rows[0] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
