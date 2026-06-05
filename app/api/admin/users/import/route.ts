import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { sendWelcomeEmail } from "@/lib/mailer";

export const runtime = "nodejs";

function generatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#";
  const bytes = randomBytes(12);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  function splitLine(line: string): string[] {
    const fields: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuote = false; }
        else { cur += ch; }
      } else {
        if (ch === '"') { inQuote = true; }
        else if (ch === ",") { fields.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
    }
    fields.push(cur.trim());
    return fields;
  }

  const headers = splitLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, "")
  );
  return lines.slice(1).map((line) => {
    const values = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  }).filter((r) => r.email);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const text = await file.text();
  const rows = parseCSV(text);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid rows found. Ensure CSV has email column." }, { status: 400 });
  }

  const results: { email: string; status: "created" | "skipped" | "error"; error?: string; emailSent?: boolean }[] = [];

  for (const row of rows) {
    const email = row.email?.toLowerCase().trim();
    const displayName = row.name || row.display_name || row.full_name || email.split("@")[0];
    const role = ["staff", "it_staff", "admin"].includes(row.role) ? row.role : "staff";

    if (!email || !email.includes("@")) {
      results.push({ email: email || "(blank)", status: "error", error: "Invalid email" });
      continue;
    }

    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      await db.query(
        `INSERT INTO users (email, display_name, role, password_hash, must_change_password)
         VALUES ($1, $2, $3, $4, true)`,
        [email, displayName.trim(), role, passwordHash]
      );

      let emailSent = false;
      try {
        await sendWelcomeEmail({ to: email, displayName: displayName.trim(), tempPassword: password, role });
        emailSent = true;
      } catch { /* SMTP non-fatal */ }

      results.push({ email, status: "created", emailSent });
    } catch (err: any) {
      if (err.code === "23505") {
        results.push({ email, status: "skipped", error: "Already exists" });
      } else {
        results.push({ email, status: "error", error: err.message });
      }
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  return NextResponse.json({ results, summary: { total: rows.length, created, skipped, errors } });
}
