/**
 * Create the first admin account for St. Mary's AI Workforce.
 *
 * Usage:
 *   node scripts/create-admin.mjs
 *
 * Reads DATABASE_URL from .env.local automatically.
 * Run this once after applying migration 003_add_users_table.sql.
 */

import { createInterface } from "readline";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pkg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load DATABASE_URL from .env.local
function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env.local");
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (key.trim() === "DATABASE_URL") {
        process.env.DATABASE_URL = rest.join("=").trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env.local not found — DATABASE_URL must already be in environment
  }
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  loadEnv();

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL not found in .env.local or environment.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n── St. Mary's AI Workforce — Create Admin Account ──\n");

  const name = await prompt(rl, "Full name:      ");
  const email = await prompt(rl, "Email:          ");
  const password = await prompt(rl, "Password (min 8 chars): ");

  rl.close();

  if (!name.trim() || !email.trim() || !password.trim()) {
    console.error("\nERROR: All fields are required.");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("\nERROR: Password must be at least 8 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO users (email, display_name, role, password_hash)
       VALUES ($1, $2, 'admin', $3)
       RETURNING id, email, display_name, role`,
      [email.toLowerCase().trim(), name.trim(), passwordHash]
    );

    const user = result.rows[0];
    console.log("\n✓ Admin account created successfully:");
    console.log(`  Name:  ${user.display_name}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Role:  ${user.role}`);
    console.log(`  ID:    ${user.id}`);
    console.log("\nYou can now sign in at http://localhost:3000/login\n");
  } catch (err) {
    if (err.code === "23505") {
      console.error(`\nERROR: An account with email "${email}" already exists.`);
    } else {
      console.error("\nERROR:", err.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
