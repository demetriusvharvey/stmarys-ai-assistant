import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      conversationId,
      feedbackType,
      question,
      answer,
      sources,
    } = body;

    if (!feedbackType) {
      return NextResponse.json(
        { success: false, error: "feedbackType is required" },
        { status: 400 }
      );
    }

    await db.query(
      `
      insert into ai_feedback
      (conversation_id, feedback_type, question, answer, sources)
      values ($1, $2, $3, $4, $5)
      `,
      [
        conversationId || null,
        feedbackType,
        question || null,
        answer || null,
        JSON.stringify(sources || []),
      ]
    );

    return NextResponse.json({
      success: true,
      message: "Feedback saved",
    });
  } catch (error: any) {
    console.error("FEEDBACK_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to save feedback",
      },
      { status: 500 }
    );
  }
}