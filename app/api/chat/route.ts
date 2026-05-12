import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { openai } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { question, userEmail } = body;

    if (!question) {
      return NextResponse.json(
        {
          success: false,
          error: "question is required",
        },
        { status: 400 }
      );
    }

    // Generate embedding for user question
    const embeddingResult = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });

    const questionEmbedding = embeddingResult.data[0].embedding;

    // Retrieve semantic matches + document metadata
    const matches = await db.query(
      `
      select
        m.id,
        m.document_id,
        m.content,
        m.source_url,
        m.similarity,
        d.title,
        d.category,
        d.source
      from match_document_chunks($1::vector, $2) m
      join documents d
        on d.id = m.document_id
      order by m.similarity desc
      `,
      [`[${questionEmbedding.join(",")}]`, 5]
    );

    // Build context for AI
    const context = matches.rows
      .map((row: any, index: number) => {
        return `
Source ${index + 1}
Document: ${row.title}
Category: ${row.category}

${row.content}
        `.trim();
      })
      .join("\n\n-------------------\n\n");

    // Generate AI answer
    const answerResult = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are St. Mary's internal AI knowledge assistant.

Rules:
- Answer ONLY using the provided context.
- If the answer is not found in the documents, say:
  "I do not know based on the available documents."
- Do not invent policies or procedures.
- Do not provide medical advice.
- Do not make clinical decisions.
- Keep responses professional, concise, and practical.
- When possible, summarize policies clearly in bullet points.
          `.trim(),
        },
        {
          role: "user",
          content: `
Question:
${question}

Context:
${context}
          `.trim(),
        },
      ],
      temperature: 0.2,
    });

    const answer =
      answerResult.choices[0]?.message?.content ||
      "I could not generate an answer.";

    // Audit logging
    await db.query(
      `
      insert into audit_logs
      (user_email, question, answer, retrieved_sources)
      values ($1, $2, $3, $4)
      `,
      [
        userEmail || null,
        question,
        answer,
        JSON.stringify(matches.rows),
      ]
    );

    return NextResponse.json({
      success: true,
      answer,
      sources: matches.rows.map((row: any) => ({
        id: row.id,
        documentId: row.document_id,
        title: row.title,
        category: row.category,
        source: row.source,
        sourceUrl: row.source_url,
        similarity: row.similarity,
      })),
    });
  } catch (error: any) {
    console.error("CHAT_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}