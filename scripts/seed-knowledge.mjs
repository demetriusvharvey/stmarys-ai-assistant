/**
 * St. Mary's Knowledge Base Seeder
 * Run from the project root: node scripts/seed-knowledge.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import OpenAI from "openai";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env.local") });

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function vectorToSql(v) {
  return "[" + v.join(",") + "]";
}

async function embed(text) {
  const r = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000),
  });
  return r.data[0].embedding;
}

async function ingestDoc(doc) {
  const { title, category, source, sourceUrl, chunks } = doc;

  // Skip if already exists
  const existing = await db.query("SELECT id FROM documents WHERE title = $1", [title]);
  if (existing.rows.length > 0) {
    console.log(`  ⏭  Already exists: ${title}`);
    return;
  }

  const docResult = await db.query(
    `INSERT INTO documents (title, source, source_url, category, created_at, is_active)
     VALUES ($1, $2, $3, $4, now(), true) RETURNING id`,
    [title, source, sourceUrl || null, category]
  );
  const docId = docResult.rows[0].id;

  console.log(`  Embedding ${chunks.length} chunks...`);
  let done = 0;
  for (let i = 0; i < chunks.length; i++) {
    // Strip null bytes — PostgreSQL rejects UTF8 null (0x00)
    const chunkText = chunks[i].replace(/\0/g, "").trim();
    if (!chunkText) continue;
    const emb = await embed(chunkText);
    await db.query(
      `INSERT INTO document_chunks (document_id, content, embedding, chunk_index, created_at)
       VALUES ($1, $2, $3::vector, $4, now())`,
      [docId, chunkText, vectorToSql(emb), i]
    );
    done++;
    if (done % 20 === 0) process.stdout.write(`    ${done}/${chunks.length}\r`);
  }
  console.log(`  ✅ ${title} — ${done} chunks`);
}

async function main() {
  const scriptsDir = __dirname;
  const seedFiles = readdirSync(scriptsDir)
    .filter(f => f.startsWith("seed-") && f.endsWith(".json"))
    .sort();

  console.log(`\nFound ${seedFiles.length} seed files:\n`);
  seedFiles.forEach(f => console.log(`  • ${f}`));
  console.log();

  for (const file of seedFiles) {
    const filePath = join(scriptsDir, file);
    // Strip null bytes that can appear from bad OCR/exports
    const raw = readFileSync(filePath, "utf8").replace(/\0/g, "");
    const parsed = JSON.parse(raw);
    // Support both single doc objects and arrays of docs
    const docs = Array.isArray(parsed) ? parsed : [parsed];
    for (const doc of docs) {
      console.log(`\n📄 ${doc.title}`);
      try {
        await ingestDoc(doc);
      } catch (err) {
        console.error(`  ❌ Failed: ${err.message}`);
      }
    }
  }

  await db.end();
  console.log("\n🎉 Seeding complete.");
}

main().catch(console.error);
