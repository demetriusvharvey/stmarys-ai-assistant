import { NextResponse } from "next/server";
import mammoth from "mammoth";
import PDFParser from "pdf2json";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

import { db } from "@/lib/db";
import { openai } from "@/lib/openai";
import { chunkText } from "@/lib/chunkText";
import { getGraphAccessToken } from "@/lib/microsoftGraph";

const BATCH_SIZE = 5;

const execFileAsync = promisify(execFile);

function vectorToSql(vector: number[]) {
  return `[${vector.join(",")}]`;
}

function getExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

function guessCategory(fileName: string, siteName?: string | null) {
  const text = `${fileName} ${siteName || ""}`.toLowerCase();

  if (text.includes("policy")) return "Policies";
  if (text.includes("procedure")) return "Procedures";
  if (text.includes("training")) return "Training";
  if (text.includes("form")) return "Forms";
  if (text.includes("hr") || text.includes("human resources")) return "HR";
  if (text.includes("clinical") || text.includes("nursing")) return "Clinical";
  if (text.includes("it") || text.includes("technology")) return "IT / Systems";

  return "SharePoint Docs";
}

function extractPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();

    parser.on("pdfParser_dataError", (errData: any) => {
      reject(
        new Error(errData?.parserError || "PDF parse error")
      );
    });

    parser.on("pdfParser_dataReady", (pdfData: any) => {
      const text = pdfData.Pages.map((page: any) =>
        page.Texts.map((textItem: any) =>
          decodeURIComponent(
            textItem.R.map((r: any) => r.T).join(" ")
          )
        ).join(" ")
      ).join("\n");

      resolve(text);
    });

    parser.parseBuffer(buffer);
  });
}

async function ocrPdf(buffer: Buffer) {
  const jobId = crypto.randomUUID();

  const tmpRoot = path.join(process.cwd(), "tmp");
  const jobDir = path.join(tmpRoot, jobId);

  const pdfPath = path.join(jobDir, "upload.pdf");
  const outputPrefix = path.join(jobDir, "page");

  await fs.mkdir(jobDir, { recursive: true });

  await fs.writeFile(pdfPath, buffer);

  try {
    await execFileAsync("pdftocairo", [
      "-png",
      "-scale-to",
      "800",
      pdfPath,
      outputPrefix,
    ]);

    const files = await fs.readdir(jobDir);

    const imageFiles = files
      .filter((file) => file.toLowerCase().endsWith(".png"))
      .sort();

    if (imageFiles.length === 0) {
      throw new Error("PDF was not converted into OCR images.");
    }

    let fullText = "";

    for (const imageFile of imageFiles) {
      const imagePath = path.join(jobDir, imageFile);

      const outputBase = path.join(
        jobDir,
        imageFile.replace(".png", "")
      );

      await execFileAsync("tesseract", [
        imagePath,
        outputBase,
        "-l",
        "eng",
      ]);

      const ocrText = await fs.readFile(
        `${outputBase}.txt`,
        "utf8"
      );

      fullText += `\n${ocrText}`;
    }

    return fullText;
  } finally {
    await fs.rm(jobDir, {
      recursive: true,
      force: true,
    });
  }
}

async function downloadSharePointFile({
  token,
  driveId,
  itemId,
}: {
  token: string;
  driveId: string;
  itemId: string;
}) {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();

    throw new Error(`Download failed: ${res.status} ${text}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function extractTextFromFile(buffer: Buffer, fileName: string) {
  const ext = getExtension(fileName);

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer });

    return result.value || "";
  }

  if (ext === ".txt" || ext === ".md" || ext === ".csv") {
    return buffer.toString("utf-8");
  }

  if (ext === ".pdf") {
    let text = "";

    try {
      text = await extractPdfText(buffer);
    } catch {
      text = "";
    }

    if (!text || text.trim().length < 50) {
      text = await ocrPdf(buffer);
    }

    return text || "";
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

async function createEmbedding(text: string) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return embedding.data[0].embedding;
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({}));

    const batchSize = Number(body.batchSize || BATCH_SIZE);

    const token = await getGraphAccessToken();

    const pendingResult = await db.query(
      `
      update sync_job_items
      set status = 'processing'
      where id in (
        select id
        from sync_job_items
        where status = 'pending'
        order by created_at asc
        limit $1
        for update skip locked
      )
      returning *
      `,
      [batchSize]
    );

    const items = pendingResult.rows;

    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending files to process.",
        processed: 0,
        failed: 0,
      });
    }

    let processed = 0;
    let failed = 0;

    const results: any[] = [];

    for (const item of items) {
      try {
        const buffer = await downloadSharePointFile({
          token,
          driveId: item.drive_id,
          itemId: item.item_id,
        });

        const rawText = await extractTextFromFile(
          buffer,
          item.item_name
        );

        const cleanText = rawText.trim();

        if (!cleanText || cleanText.length < 50) {
          throw new Error("No text extracted from file");
        }

        const category = guessCategory(
          item.item_name,
          item.site_name
        );

        const documentResult = await db.query(
          `
          insert into documents (
            title,
            source,
            source_url,
            category,
            created_at
          )
          values ($1, $2, $3, $4, now())
          returning id
          `,
          [
            item.item_name,
            "sharepoint",
            item.web_url || null,
            category,
          ]
        );

        const documentId = documentResult.rows[0].id;

        const chunks = chunkText(cleanText);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];

          const embedding = await createEmbedding(chunk);

          await db.query(
            `
            insert into document_chunks (
              document_id,
              content,
              embedding,
              chunk_index,
              created_at
            )
            values ($1, $2, $3::vector, $4, now())
            `,
            [
              documentId,
              chunk,
              vectorToSql(embedding),
              i,
            ]
          );
        }

        await db.query(
          `
          update sync_job_items
          set
            status = 'synced',
            processed_at = now(),
            error = null
          where id = $1
          `,
          [item.id]
        );

        await db.query(
          `
          update sync_jobs
          set synced_files = synced_files + 1
          where id = $1
          `,
          [item.job_id]
        );

        processed++;

        results.push({
          file: item.item_name,
          status: "synced",
          chunks: chunks.length,
        });
      } catch (error: any) {
        failed++;

        await db.query(
          `
          update sync_job_items
          set
            status = 'failed',
            processed_at = now(),
            error = $2
          where id = $1
          `,
          [item.id, error.message || "Failed to process file"]
        );

        await db.query(
          `
          update sync_jobs
          set failed_files = failed_files + 1
          where id = $1
          `,
          [item.job_id]
        );

        results.push({
          file: item.item_name,
          status: "failed",
          error: error.message || "Failed to process file",
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      failed,
      durationMs: Date.now() - startedAt,
      results,
    });
  } catch (error: any) {
    console.error("Batch sync processor error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Batch processor failed",
      },
      { status: 500 }
    );
  }
}