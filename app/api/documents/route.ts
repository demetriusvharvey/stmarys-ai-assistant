import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await db.query(`
      select
        d.id,
        d.title,
        d.category,
        d.source,
        d.source_url,
        d.is_active,
        d.created_at,
        count(dc.id)::int as chunks
      from documents d
      left join document_chunks dc
        on dc.document_id = d.id
      group by d.id
      order by d.created_at desc
    `);

    return NextResponse.json({
      success: true,
      documents: result.rows,
    });
  } catch (error: any) {
    console.error("DOCUMENTS_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}