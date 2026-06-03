import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    // Delete messages first (FK constraint), then conversations
    await db.query(
      `DELETE FROM messages WHERE conversation_id IN (
         SELECT id FROM conversations WHERE user_id = $1
       )`,
      [session.id]
    );
    await db.query(
      `DELETE FROM conversations WHERE user_id = $1`,
      [session.id]
    );
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
