import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await db.query(
    `SELECT id, title, created_at, updated_at FROM conversations WHERE id = $1 AND user_id = $2`,
    [id, session.id]
  );
  if (result.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ conversation: result.rows[0] });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;

    const conversationResult = await db.query(
      `select id from conversations where id = $1 and user_id = $2`,
      [id, session.id]
    );

    if (conversationResult.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Conversation not found" },
        { status: 404 }
      );
    }

    await db.query(`delete from messages where conversation_id = $1`, [id]);
    await db.query(`delete from conversations where id = $1 and user_id = $2`, [
      id,
      session.id,
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete chat" },
      { status: 500 }
    );
  }
}
