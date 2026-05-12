import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const queueResult = await db.query(`
      select status, count(*)::int as count
      from sync_job_items
      group by status
      order by status
    `);

    const docsResult = await db.query(`
      select count(*)::int as total_documents
      from documents
    `);

    const chunksResult = await db.query(`
      select count(*)::int as total_chunks
      from document_chunks
    `);

    const failedResult = await db.query(`
      select
        item_name,
        site_name,
        error,
        processed_at
      from sync_job_items
      where status = 'failed'
      order by processed_at desc nulls last
      limit 25
    `);

    const jobsResult = await db.query(`
      select
        id,
        status,
        total_sites,
        total_items,
        supported_files,
        synced_files,
        failed_files,
        current_site,
        error,
        created_at,
        started_at,
        completed_at
      from sync_jobs
      order by created_at desc
      limit 10
    `);

    return NextResponse.json({
      success: true,
      queue: queueResult.rows,
      documents: docsResult.rows[0],
      chunks: chunksResult.rows[0],
      recentFailures: failedResult.rows,
      recentJobs: jobsResult.rows,
    });
  } catch (error: any) {
    console.error("Sync dashboard error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load sync dashboard",
      },
      { status: 500 }
    );
  }
}