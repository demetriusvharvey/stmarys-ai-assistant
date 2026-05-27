import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type DocumentChunk = {
  id: string;
  chunk_index: number | null;
  content: string;
  created_at: string;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const documentId = searchParams.get("documentId");

    if (!documentId) {
      return NextResponse.json(
        {
          success: false,
          error: "documentId is required",
        },
        { status: 400 }
      );
    }

    const docResult = await db.query(
      `
      select
        id,
        title,
        category,
        source,
        source_url,
        external_id,
        created_at
      from documents
      where id = $1
      limit 1
      `,
      [documentId]
    );

    if (docResult.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Document not found",
        },
        { status: 404 }
      );
    }

    const chunkResult = await db.query(
      `
      select
        id,
        chunk_index,
        content,
        created_at
      from document_chunks
      where document_id = $1
      order by chunk_index asc
      `,
      [documentId]
    );
    const chunks = chunkResult.rows as DocumentChunk[];

    return NextResponse.json({
      success: true,
      document: docResult.rows[0],
      chunkCount: chunks.length,
      chunks,
      fullText: chunks
        .map((chunk) => chunk.content)
        .join("\n\n"),
    });
  } catch (error: any) {
    console.error("Open document tool error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to open document",
      },
      { status: 500 }
    );
  }
}
