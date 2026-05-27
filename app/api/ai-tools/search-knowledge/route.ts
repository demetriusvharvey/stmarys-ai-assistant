import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { openai } from "@/lib/openai";

export const runtime = "nodejs";

type SearchKnowledgeRow = {
  chunk_id: string;
  document_id: string;
  content: string;
  chunk_index: number | null;
  title: string;
  category: string;
  source: string;
  source_url: string | null;
  external_id: string | null;
  similarity: number | string;
};

function vectorToSql(vector: number[]) {
  return `[${vector.join(",")}]`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const query = body.query;
    const limit = Number(body.limit || 8);
    const category = body.category || null;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "query is required",
        },
        { status: 400 }
      );
    }

    const embeddingResult = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    const embedding = embeddingResult.data[0].embedding;
    const vector = vectorToSql(embedding);

    const result = await db.query(
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

    const rows = result.rows as SearchKnowledgeRow[];

    return NextResponse.json({
      success: true,
      query,
      category,
      count: rows.length,
      results: rows.map((row) => ({
        chunkId: row.chunk_id,
        documentId: row.document_id,
        title: row.title,
        category: row.category,
        source: row.source,
        sourceUrl: row.source_url,
        externalId: row.external_id,
        similarity: Number(row.similarity),
        content: row.content,
        chunkIndex: row.chunk_index,
      })),
    });
  } catch (error: any) {
    console.error("AI tool search knowledge error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to search knowledge",
      },
      { status: 500 }
    );
  }
}
