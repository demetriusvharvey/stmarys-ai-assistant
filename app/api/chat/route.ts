import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/ai/answerQuestion";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, userEmail, conversationId } = body;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { success: false, error: "question is required" },
        { status: 400 }
      );
    }

    const result = await answerQuestion({
      question,
      userEmail,
      conversationId,
    });

    return NextResponse.json({
      success: true,
      trainingMode: result.trainingMode,
      documentationMode: result.documentationMode,
      answer: result.answer,
      escalation: result.escalation,
      verification: result.verification,
      sources: result.sources,
    });
  } catch (error: any) {
    console.error("CHAT_ERROR:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
