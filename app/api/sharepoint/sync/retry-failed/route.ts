import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const result = await db.query(`
      update sync_job_items
      set
        status = 'pending',
        error = null,
        processed_at = null
      where status = 'failed'
      returning id
    `);

    return NextResponse.json({
      success: true,
      retried: result.rows.length,
    });
  } catch (error: any) {
    console.error("Retry failed sync items error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to retry failed files",
      },
      { status: 500 }
    );
  }
}