import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

async function requireAdmin() {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { is_active } = await req.json();
    if (typeof is_active !== "boolean") {
      return NextResponse.json({ success: false, error: "is_active (boolean) required" }, { status: 400 });
    }

    const result = await db.query(
      `UPDATE documents SET is_active = $1 WHERE id = $2 RETURNING id, title, is_active`,
      [is_active, params.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, document: result.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await db.query(`DELETE FROM document_chunks WHERE document_id = $1`, [params.id]);
    await db.query(`DELETE FROM documents WHERE id = $1`, [params.id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
