import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { openai } from "@/lib/openai";
import { getSession } from "@/lib/session";
import { chunkText } from "@/lib/chunkText";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, rm, mkdir } from "fs/promises";
import { join } from "path";
import crypto from "crypto";
import mammoth from "mammoth";

export const runtime = "nodejs";
export const maxDuration = 300;

const execFileAsync = promisify(execFile);

function vectorToSql(v: number[]) {
  return "[" + v.join(",") + "]";
}

function guessCategory(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("handbook") || t.includes("employee")) return "HR";
  if (t.includes("policy") || t.includes("policies") || /^hr policy/.test(t)) return "Policies";
  if (t.includes("procedure")) return "Procedures";
  if (t.includes("training")) return "Training";
  if (t.includes("compliance") || t.includes("cms") || t.includes("survey")) return "Compliance";
  if (t.includes("it") || t.includes("tech")) return "IT / Systems";
  if (t.includes("clinical") || t.includes("nursing")) return "Clinical";
  if (t.includes("osha") || t.includes("safety")) return "Safety";
  if (t.includes("cdc") || t.includes("infection")) return "Infection Control";
  return "General";
}

async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }

  if (["txt", "md", "csv"].includes(ext)) {
    return buffer.toString("utf-8");
  }

  if (ext === "pdf") {
    // Try text extraction first via pdftotext
    const jobId = crypto.randomUUID();
    const jobDir = join(process.cwd(), "tmp", jobId);
    await mkdir(jobDir, { recursive: true });
    const pdfPath = join(jobDir, "input.pdf");
    await writeFile(pdfPath, buffer);

    try {
      const { stdout } = await execFileAsync("pdftotext", [pdfPath, "-"]).catch(() => ({ stdout: "" }));
      if (stdout && stdout.trim().length > 50) {
        return stdout;
      }

      // Fall back to OCR
      await execFileAsync("pdftocairo", ["-png", "-scale-to", "800", pdfPath, join(jobDir, "page")]);
      const { readdir } = await import("fs/promises");
      const files = (await readdir(jobDir)).filter((f) => f.endsWith(".png")).sort();
      let text = "";
      for (const f of files) {
        const imgPath = join(jobDir, f);
        const outBase = join(jobDir, f.replace(".png", ""));
        await execFileAsync("tesseract", [imgPath, outBase, "-l", "eng"]);
        text += "\n" + (await readFile(`${outBase}.txt`, "utf8"));
      }
      return text;
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const titleOverride = (formData.get("title") as string | null)?.trim() || null;
    const categoryOverride = (formData.get("category") as string | null)?.trim() || null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const fileName = file.name;
    const title = titleOverride || fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    const category = categoryOverride || guessCategory(title);

    // Duplicate check
    const existing = await db.query("SELECT id FROM documents WHERE title = $1", [title]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ success: false, error: `A document titled "${title}" already exists.` });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rawText = await extractTextFromBuffer(buffer, fileName);
    const cleanText = rawText.trim();

    if (!cleanText || cleanText.length < 50) {
      return NextResponse.json({ success: false, error: "Could not extract enough text from this file." });
    }

    const docResult = await db.query(
      `INSERT INTO documents (title, source, source_url, category, is_active, created_at)
       VALUES ($1, 'upload', NULL, $2, true, now()) RETURNING id`,
      [title, category]
    );
    const docId = docResult.rows[0].id;

    const chunks = chunkText(cleanText);
    let embedded = 0;

    for (let i = 0; i < chunks.length; i++) {
      const embResult = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunks[i].slice(0, 8000),
      });
      const embedding = embResult.data[0].embedding;
      await db.query(
        `INSERT INTO document_chunks (document_id, content, embedding, chunk_index, created_at)
         VALUES ($1, $2, $3::vector, $4, now())`,
        [docId, chunks[i], vectorToSql(embedding), i]
      );
      embedded++;
    }

    return NextResponse.json({ success: true, documentId: docId, title, category, chunks: embedded });
  } catch (err: any) {
    console.error("[upload] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
