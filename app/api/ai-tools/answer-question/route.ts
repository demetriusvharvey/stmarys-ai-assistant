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
    const limit = Number(body.limit || 7);
    const category = body.category || null;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { success: false, error: "question is required" },
        { status: 400 }
      );
    }

    const embeddingResult = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: question,
    });

    const embedding = embeddingResult.data[0].embedding;
    const vector = vectorToSql(embedding);

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
        d.is_active = true
        and ($3::text is null or d.category = $3)
      order by dc.embedding <=> $1::vector
      limit $2
      `,
      [vector, limit, category]
    );

    const chunks = searchResult.rows;
    const topSimilarity = Number(chunks[0]?.similarity || 0);
    const hasStrongInternalMatch = topSimilarity >= 0.62;
    const hasPossibleInternalMatch = topSimilarity >= 0.48;

    const context = chunks
      .map(
        (chunk, index) => `
[Document ${index + 1}]
Title: ${chunk.title}
Category: ${chunk.category}
Similarity: ${chunk.similarity}
Content:
${chunk.content}
`
      )
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are the St. Mary's Home AI Knowledge Assistant and troubleshooting copilot.

Purpose:
- Help St. Mary's staff solve real operational and IT problems.
- Use active internal knowledge when it is relevant.
- Use general AI troubleshooting knowledge when internal documents are missing, weak, outdated, or clearly mismatched.
- Be transparent about whether the answer came from internal St. Mary's documents or general guidance.

Rules:
- Do not invent St. Mary's policies.
- Do not provide medical advice or clinical decisions.
- If internal docs are strong, answer from them and mention the document title.
- If internal docs are weak or unrelated, say: "I may not have found the exact St. Mary's document for this, but generally..."
- If the user is vague, ask smart follow-up questions.
- If the user says the answer is wrong, do not shut down. Acknowledge, ask clarifying questions, and offer to search differently.
- For troubleshooting, give practical step-by-step guidance.
- For voicemail/phones, clarify whether they mean desk phone voicemail, Teams voicemail, Aspire, or another phone system if the docs are unclear.
          `.trim(),
        },
        {
          role: "user",
          content: `
Question:
${question}

Retrieval quality:
Top similarity: ${topSimilarity}
Strong internal match: ${hasStrongInternalMatch}
Possible internal match: ${hasPossibleInternalMatch}

Retrieved Knowledge:
${context || "No active internal knowledge found."}
          `.trim(),
        },
      ],
      temperature: 0.35,
    });

    const answer =
      completion.choices[0]?.message?.content ||
      "No answer could be generated.";

    return NextResponse.json({
      success: true,
      question,
      answer,
      retrievedChunks: chunks.length,
      retrieval: {
        topSimilarity,
        hasStrongInternalMatch,
        hasPossibleInternalMatch,
      },
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