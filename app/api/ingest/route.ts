import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { openai } from "@/lib/openai";
import { chunkText } from "@/lib/chunkText";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();

    const { title, category, source, sourceUrl, text } = body;

    if (!title || !text) {
      return NextResponse.json(
        { success: false, error: "title and text are required" },
        { status: 400 }
      );
    }

    const chunks = chunkText(text);

    if (chunks.length === 0) {
      return NextResponse.json(
        { success: false, error: "No usable chunks created from text" },
        { status: 400 }
      );
    }

    const docResult = await db.query(
      `
      insert into documents (title, source, category)
      values ($1, $2, $3)
      returning id
      `,
      [title, source || null, category || null]
    );

    const documentId = docResult.rows[0].id;

    for (const chunk of chunks) {
      const embeddingResult = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk,
      });

      const embedding = embeddingResult.data[0].embedding;

      await db.query(
        `
        insert into document_chunks
        (document_id, content, embedding, source_url)
        values ($1, $2, $3, $4)
        `,
        [documentId, chunk, `[${embedding.join(",")}]`, sourceUrl || null]
      );
    }

    return NextResponse.json({
      success: true,
      documentId,
      chunksStored: chunks.length,
    });
  } catch (error: any) {
    console.error("INGEST_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}