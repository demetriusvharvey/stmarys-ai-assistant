import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await db.query(`
      select
        id,
        conversation_id,
        feedback_type,
        question,
        answer,
        sources,
        created_at
      from ai_feedback
      order by created_at desc
      limit 200
    `);

    return NextResponse.json({
      success: true,
      feedback: result.rows,
    });
  } catch (error: any) {
    console.error("FEEDBACK_LIST_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load feedback",
      },
      { status: 500 }
    );
  }
}