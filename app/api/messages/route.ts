import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json(
        { success: false, error: "Missing conversationId" },
        { status: 400 }
      );
    }

    const result = await db.query(
      `
      select
        id,
        conversation_id,
        role,
        content,
        sources,
        created_at
      from messages
      where conversation_id = $1
      order by created_at asc
      `,
      [conversationId]
    );

    return NextResponse.json({
      success: true,
      messages: result.rows,
    });
  } catch (error: any) {
    console.error("List messages error:", error);

    return NextResponse.json(
      { success: false, error: error.message || "Failed to list messages" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const conversationId = body.conversationId;
    const role = body.role;
    const content = body.content;
    const sources = body.sources || null;

    if (!conversationId || !role || !content) {
      return NextResponse.json(
        {
          success: false,
          error: "conversationId, role, and content are required",
        },
        { status: 400 }
      );
    }

    if (!["user", "assistant"].includes(role)) {
      return NextResponse.json(
        { success: false, error: "Invalid role" },
        { status: 400 }
      );
    }

    const result = await db.query(
      `
      insert into messages (
        conversation_id,
        role,
        content,
        sources
      )
      values ($1, $2, $3, $4)
      returning id, conversation_id, role, content, sources, created_at
      `,
      [conversationId, role, content, sources ? JSON.stringify(sources) : null]
    );

    await db.query(
      `
      update conversations
      set
        updated_at = now(),
        title = case
          when title = 'New Chat' and $2 = 'user'
          then left($3, 60)
          else title
        end
      where id = $1
      `,
      [conversationId, role, content]
    );

    return NextResponse.json({
      success: true,
      message: result.rows[0],
    });
  } catch (error: any) {
    console.error("Create message error:", error);

    return NextResponse.json(
      { success: false, error: error.message || "Failed to create message" },
      { status: 500 }
    );
  }
}