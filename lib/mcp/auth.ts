import type { NextRequest } from "next/server";

export function verifyInternalSecret(req: NextRequest | Request): boolean {
  const secret = process.env.INTERNAL_ADMIN_SECRET;
  if (!secret) return false;
  const header = (req as Request).headers.get("x-internal-admin-secret");
  const bearer = (req as Request).headers.get("authorization");
  return header === secret || bearer === `Bearer ${secret}`;
}
