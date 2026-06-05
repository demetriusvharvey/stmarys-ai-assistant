import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { openai } from "@/lib/openai";
import { getSession } from "@/lib/session";
import { chunkText } from "@/lib/chunkText";

export const runtime = "nodejs";
export const maxDuration = 300;

function vectorToSql(v: number[]) {
  return "[" + v.join(",") + "]";
}

function guessCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("handbook") || t.includes("employee")) return "HR";
  if (t.includes("policy") || t.includes("policies")) return "Policies";
  if (t.includes("procedure")) return "Procedures";
  if (t.includes("training")) return "Training";
  if (t.includes("compliance") || t.includes("cms") || t.includes("survey")) return "Compliance";
  if (t.includes("it") || t.includes("tech")) return "IT / Systems";
  if (t.includes("clinical") || t.includes("nursing")) return "Clinical";
  if (t.includes("osha") || t.includes("safety")) return "Safety";
  if (t.includes("cdc") || t.includes("infection")) return "Infection Control";
  if (t.includes("payroll") || t.includes("benefits")) return "HR";
  return "General";
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { title, text, sourceLabel, sourceUrl, category } = body;

    if (!title || !text || text.length < 50) {
      return NextResponse.json({ success: false, error: "title and text required (min 50 chars)" }, { status: 400 });
    }

    // Check if already exists
    const existing = await db.query("SELECT id FROM documents WHERE title = $1", [title]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ success: false, error: "Document with this title already exists", id: existing.rows[0].id });
    }

    const resolvedCategory = category || guessCategory(title);

    // Insert document record
    const docResult = await db.query(
      `INSERT INTO documents (title, source, source_url, category, created_at)
       VALUES ($1, $2, $3, $4, now()) RETURNING id`,
      [title, sourceLabel || "upload", sourceUrl || null, resolvedCategory]
    );
    const docId = docResult.rows[0].id;

    // Chunk and embed
    const chunks = chunkText(text);
    let embedded = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embResult = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk.slice(0, 8000),
      });
      const embedding = embResult.data[0].embedding;

      await db.query(
        `INSERT INTO document_chunks (document_id, content, embedding, chunk_index, created_at)
         VALUES ($1, $2, $3::vector, $4, now())`,
        [docId, chunk, vectorToSql(embedding), i]
      );
      embedded++;
    }

    return NextResponse.json({
      success: true,
      documentId: docId,
      title,
      category: resolvedCategory,
      chunks: embedded,
    });
  } catch (err: any) {
    console.error("[ingest-direct] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
