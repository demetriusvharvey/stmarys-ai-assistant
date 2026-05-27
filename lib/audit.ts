import { db } from "@/lib/db";

type AuditMetadata = Record<string, any>;

type WriteAuditLogInput = {
  userEmail?: string | null;
  action: string;
  route?: string | null;
  metadata?: AuditMetadata | null;
};

function safeMetadata(metadata?: AuditMetadata | null) {
  if (!metadata) return null;

  return JSON.parse(
    JSON.stringify(metadata, (_key, value) => {
      if (typeof value !== "string") {
        return value;
      }

      return value
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
        .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[PHONE]")
        .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]")
        .replace(/\b(?:DOB|D\.O\.B\.|Date of Birth)\s*[:\-]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi, "[DOB]")
        .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, "[DATE]");
    })
  );
}

export async function writeAuditLog({
  userEmail = null,
  action,
  route = null,
  metadata = null,
}: WriteAuditLogInput) {
  try {
    await db.query(
      `
      insert into audit_logs (
        user_email,
        action,
        route,
        metadata,
        created_at
      )
      values ($1, $2, $3, $4, now())
      `,
      [
        userEmail,
        action,
        route,
        safeMetadata(metadata),
      ]
    );
  } catch (error) {
    console.error("Audit log write failed");
  }
}