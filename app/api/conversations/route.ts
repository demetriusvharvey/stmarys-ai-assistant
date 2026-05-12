import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await db.query(`
      select
        id,
        title,
        created_at,
        updated_at
      from conversations
      order by updated_at desc
      limit 50
    `);

    return NextResponse.json({
      success: true,
      conversations: result.rows,
    });
  } catch (error: any) {
    console.error("List conversations error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to list conversations",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const title = body.title || "New Chat";

    const result = await db.query(
      `
      insert into conversations (title)
      values ($1)
      returning id, title, created_at, updated_at
      `,
      [title]
    );

    return NextResponse.json({
      success: true,
      conversation: result.rows[0],
    });
  } catch (error: any) {
    console.error("Create conversation error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create conversation",
      },
      { status: 500 }
    );
  }
}