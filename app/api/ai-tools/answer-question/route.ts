import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";

function vectorToSql(vector: number[]) {
  return `[${vector.join(",")}]`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const question = body.question;
    const limit = Number(body.limit || 6);
    const category = body.category || null;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "question is required",
        },
        { status: 400 }
      );
    }

    // Create embedding
    const embeddingResult = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });

    const embedding = embeddingResult.data[0].embedding;
    const vector = vectorToSql(embedding);

    // Retrieve relevant chunks
    const searchResult = await db.query(
      `
      select
        dc.id as chunk_id,
        dc.document_id,
        dc.content,
        dc.chunk_index,
        d.title,
        d.category,
        d.source,
        d.source_url,
        d.external_id,
        1 - (dc.embedding <=> $1::vector) as similarity
      from document_chunks dc
      join documents d
        on d.id = dc.document_id
      where
        ($3::text is null or d.category = $3)
      order by dc.embedding <=> $1::vector
      limit $2
      `,
      [vector, limit, category]
    );

    const chunks = searchResult.rows;

    const context = chunks
      .map(
        (chunk, index) => `
[Document ${index + 1}]
Title: ${chunk.title}
Category: ${chunk.category}
Content:
${chunk.content}
`
      )
      .join("\n\n");

    // Generate answer
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",

      messages: [
        {
          role: "system",
          content: `
You are the St. Mary's Home AI Knowledge Assistant.

Rules:
- Only answer from retrieved knowledge.
- If information is missing, say you could not find it.
- Be concise and operationally helpful.
- Do not hallucinate policies or procedures.
- Cite document titles naturally when useful.
          `,
        },
        {
          role: "user",
          content: `
Question:
${question}

Retrieved Knowledge:
${context}
          `,
        },
      ],

      temperature: 0.2,
    });

    const answer =
      completion.choices[0]?.message?.content ||
      "No answer could be generated.";

    return NextResponse.json({
      success: true,
      question,
      answer,
      retrievedChunks: chunks.length,
      sources: chunks.map((chunk) => ({
        chunkId: chunk.chunk_id,
        documentId: chunk.document_id,
        title: chunk.title,
        category: chunk.category,
        source: chunk.source,
        sourceUrl: chunk.source_url,
        externalId: chunk.external_id,
        similarity: Number(chunk.similarity),
        chunkIndex: chunk.chunk_index,
      })),
    });
  } catch (error: any) {
    console.error("AI tool answer question error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to answer question",
      },
      { status: 500 }
    );
  }
}