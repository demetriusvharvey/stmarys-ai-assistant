import { NextRequest, NextResponse } from "next/server";
import PDFParser from "pdf2json";
import mammoth from "mammoth";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";

import { getGraphAccessToken } from "@/lib/microsoftGraph";
import { db } from "@/lib/db";
import { openai } from "@/lib/openai";
import { chunkText } from "@/lib/chunkText";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

type SharePointSite = {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
};

type SharePointItem = {
  siteId: string;
  siteName: string;
  siteDisplayName: string;
  id: string;
  name: string;
  path: string;
  webUrl: string;
  mimeType: string | null;
  isFile: boolean;
  isFolder: boolean;
};

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isSupportedFile(name: string) {
  const lower = name.toLowerCase();

  return (
    lower.endsWith(".pdf") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".docx")
  );
}

function shouldSkipSite(site: SharePointSite) {
  const value = `${site.name || ""} ${site.displayName || ""} ${
    site.webUrl || ""
  }`.toLowerCase();

  return (
    value.includes("/contentstorage/") ||
    value.includes("contentstorage") ||
    value.includes("designer") ||
    value.includes("my workspace") ||
    value.includes("appcatalog")
  );
}

function shouldSkipFile(filePath: string, fileName: string) {
  const value = `${filePath} ${fileName}`.toLowerCase();

  return (
    value.includes("email attachments") ||
    value.includes("agenda") ||
    value.includes("meeting") ||
    value.includes("schedule") ||
    value.includes("draft") ||
    value.includes("copy of") ||
    value.includes("temp") ||
    value.includes("temporary") ||
    value.includes("archive") ||
    value.includes("transcript") ||
    value.includes("scan00") ||
    value.includes("packing slip") ||
    value.includes("purchase order") ||
    value.includes("_purchase order")
  );
}

async function refreshToken() {
  return await getGraphAccessToken();
}

async function graphFetchJson(url: string) {
  let token = await refreshToken();

  let res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  let data = await res.json();

  if (
    res.status === 401 ||
    data?.error?.code === "InvalidAuthenticationToken"
  ) {
    console.log("Graph token expired during JSON request. Refreshing token...");

    token = await refreshToken();

    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    data = await res.json();
  }

  return { res, data };
}

async function graphDownloadFile(siteId: string, itemId: string) {
  let token = await refreshToken();

  let res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/content`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (res.status === 401) {
    console.log("Graph token expired during file download. Refreshing token...");

    token = await refreshToken();

    res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/content`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText);
  }

  const arrayBuffer = await res.arrayBuffer();

  return Buffer.from(arrayBuffer);
}

async function getAllSites(): Promise<SharePointSite[]> {
  const sites: SharePointSite[] = [];

  let url = "https://graph.microsoft.com/v1.0/sites?search=*";

  while (url) {
    const { res, data } = await graphFetchJson(url);

    if (!res.ok) {
      throw new Error(JSON.stringify(data));
    }

    for (const site of data.value || []) {
      sites.push({
        id: site.id,
        name: site.name,
        displayName: site.displayName,
        webUrl: site.webUrl,
      });
    }

    url = data["@odata.nextLink"] || "";
  }

  return sites.filter((site) => !shouldSkipSite(site));
}

async function listChildrenForSite(
  site: SharePointSite,
  itemId = "root",
  folderPath = "",
  depth = 0,
  maxDepth = 6
): Promise<SharePointItem[]> {
  const url =
    itemId === "root"
      ? `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root/children`
      : `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${itemId}/children`;

  const { res, data } = await graphFetchJson(url);

  if (!res.ok) {
    console.log(
      "Skipping site/folder due to Graph error:",
      site.displayName,
      JSON.stringify(data)
    );

    return [];
  }

  let results: SharePointItem[] = [];

  for (const item of data.value || []) {
    const currentPath = folderPath ? `${folderPath}/${item.name}` : item.name;

    const mappedItem: SharePointItem = {
      siteId: site.id,
      siteName: site.name,
      siteDisplayName: site.displayName || site.name,
      id: item.id,
      name: item.name,
      path: currentPath,
      webUrl: item.webUrl,
      mimeType: item.file?.mimeType || null,
      isFile: Boolean(item.file),
      isFolder: Boolean(item.folder),
    };

    results.push(mappedItem);

    if (item.folder && depth < maxDepth) {
      const nested = await listChildrenForSite(
        site,
        item.id,
        currentPath,
        depth + 1,
        maxDepth
      );

      results = results.concat(nested);
    }
  }

  return results;
}

function extractPdfText(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();

    parser.on("pdfParser_dataError", (errData: any) => {
      reject(new Error(errData?.parserError || "PDF parse error"));
    });

    parser.on("pdfParser_dataReady", (pdfData: any) => {
      try {
        const pages = pdfData?.Pages || [];

        const text = pages
          .map((page: any) => {
            const textItems = page?.Texts || [];

            return textItems
              .map((textItem: any) => {
                const runs = textItem?.R || [];

                const raw = runs
                  .map((r: any) => r?.T || "")
                  .join(" ");

                return safeDecode(raw);
              })
              .join(" ");
          })
          .join("\n");

        resolve(text);
      } catch (error: any) {
        reject(new Error(error?.message || "PDF text extraction failed"));
      }
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
    console.log("OCR: converting PDF to images...");

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
      throw new Error("No images generated for OCR.");
    }

    let fullText = "";

    for (const imageFile of imageFiles) {
      console.log("OCR processing:", imageFile);

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

      const ocrText = await fs.readFile(`${outputBase}.txt`, "utf8");

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

async function extractTextFromBuffer(fileName: string, buffer: Buffer) {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".txt")) {
    return {
      text: buffer.toString("utf8"),
      method: "text",
    };
  }

  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer });

    return {
      text: result.value,
      method: "docx",
    };
  }

  if (lower.endsWith(".pdf")) {
    let text = "";

    try {
      text = await extractPdfText(buffer);
    } catch (error: any) {
      console.log(
        `PDF text extraction failed for ${fileName}:`,
        error?.message
      );

      text = "";
    }

    if (!text || text.trim().length < 50) {
      text = await ocrPdf(buffer);

      return {
        text,
        method: "ocr",
      };
    }

    return {
      text,
      method: "pdf-text",
    };
  }

  return {
    text: "",
    method: "unsupported",
  };
}

export async function GET(req: NextRequest) {
  try {
    const maxParam = req.nextUrl.searchParams.get("max");
    const maxFiles = maxParam ? Number(maxParam) : 25;

    const maxSitesParam = req.nextUrl.searchParams.get("maxSites");
    const maxSites = maxSitesParam ? Number(maxSitesParam) : 10;

    const depthParam = req.nextUrl.searchParams.get("depth");
    const maxDepth = depthParam ? Number(depthParam) : 6;

    console.log("Starting curated multi-site SharePoint sync...");
    console.log("Max files:", maxFiles);
    console.log("Max sites:", maxSites);
    console.log("Max depth:", maxDepth);

    const allSites = await getAllSites();

    const targetSites = allSites.slice(0, maxSites);

    console.log("Sites discovered:", allSites.length);
    console.log(
      "Sites selected:",
      targetSites.map((site) => site.displayName || site.name)
    );

    let allItems: SharePointItem[] = [];

    for (const site of targetSites) {
      console.log("Crawling site:", site.displayName || site.name);

      const siteItems = await listChildrenForSite(
        site,
        "root",
        "",
        0,
        maxDepth
      );

      allItems = allItems.concat(siteItems);
    }

    const supportedFiles = allItems.filter(
      (item) =>
        item.isFile &&
        isSupportedFile(item.name) &&
        !shouldSkipFile(item.path, item.name)
    );

    console.log("Curated supported files found:", supportedFiles.length);

    const results = [];
    const skipped = [];
    const failed = [];

    for (const file of supportedFiles) {
      if (results.length >= maxFiles) break;

      try {
        const existing = await db.query(
          `
          select d.id
          from documents d
          join document_chunks dc
            on dc.document_id = d.id
          where dc.source_url = $1
          limit 1
          `,
          [file.webUrl]
        );

        if (existing.rows.length > 0) {
          console.log("Skipping existing:", file.path);

          skipped.push({
            site: file.siteDisplayName,
            path: file.path,
            reason: "already_exists",
          });

          continue;
        }

        console.log(
          `Downloading: [${file.siteDisplayName}] ${file.path}`
        );

        const buffer = await graphDownloadFile(file.siteId, file.id);

        const extracted = await extractTextFromBuffer(file.name, buffer);

        if (!extracted.text || extracted.text.trim().length < 50) {
          console.log("Skipping unreadable:", file.path);

          skipped.push({
            site: file.siteDisplayName,
            path: file.path,
            reason: "unreadable",
          });

          continue;
        }

        const chunks = chunkText(extracted.text);

        if (chunks.length === 0) {
          console.log("No chunks created:", file.path);

          skipped.push({
            site: file.siteDisplayName,
            path: file.path,
            reason: "no_chunks",
          });

          continue;
        }

        const docResult = await db.query(
          `
          insert into documents
          (title, source, category)
          values ($1, $2, $3)
          returning id
          `,
          [
            file.name,
            `SharePoint Sync - ${file.siteDisplayName} (${extracted.method})`,
            file.siteDisplayName || "SharePoint",
          ]
        );

        const documentId = docResult.rows[0].id;

        for (let i = 0; i < chunks.length; i++) {
          console.log(
            `Embedding ${file.name}: ${i + 1}/${chunks.length}`
          );

          const embeddingResult =
            await openai.embeddings.create({
              model: "text-embedding-3-small",
              input: chunks[i],
            });

          const embedding = embeddingResult.data[0].embedding;

          await db.query(
            `
            insert into document_chunks
            (document_id, content, embedding, source_url)
            values ($1, $2, $3, $4)
            `,
            [
              documentId,
              chunks[i],
              `[${embedding.join(",")}]`,
              file.webUrl,
            ]
          );
        }

        results.push({
          id: documentId,
          site: file.siteDisplayName,
          name: file.name,
          path: file.path,
          method: extracted.method,
          chunks: chunks.length,
          webUrl: file.webUrl,
        });
      } catch (error: any) {
        console.error(
          "Failed processing file:",
          file.path,
          error?.message
        );

        failed.push({
          site: file.siteDisplayName,
          path: file.path,
          error: error?.message || "Unknown error",
        });

        continue;
      }
    }

    return NextResponse.json({
      success: true,
      mode: "curated-multi-site",
      totalSitesDiscovered: allSites.length,
      sitesScanned: targetSites.length,
      totalItemsDiscovered: allItems.length,
      totalSupportedFilesAfterCuration: supportedFiles.length,
      syncedThisRun: results.length,
      skippedThisRun: skipped.length,
      failedThisRun: failed.length,
      maxFiles,
      maxSites,
      maxDepth,
      synced: results,
      skipped,
      failed,
    });
  } catch (error: any) {
    console.error("SHAREPOINT_CURATED_SYNC_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}