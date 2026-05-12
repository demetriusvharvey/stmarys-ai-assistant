import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const queueResult = await db.query(`
      select
        status,
        count(*)::int as count
      from sync_job_items
      group by status
    `);

    const documentResult = await db.query(`
      select count(*)::int as total_documents
      from documents
    `);

    const chunkResult = await db.query(`
      select count(*)::int as total_chunks
      from document_chunks
    `);

    const latestJobResult = await db.query(`
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
      limit 1
    `);

    const recentFailuresResult = await db.query(`
      select
        item_name,
        site_name,
        error,
        processed_at
      from sync_job_items
      where status = 'failed'
      order by processed_at desc nulls last
      limit 10
    `);

    const queueMap: Record<string, number> = {};

    for (const row of queueResult.rows) {
      queueMap[row.status] = Number(row.count || 0);
    }

    const pending = queueMap.pending || 0;
    const processing = queueMap.processing || 0;
    const synced = queueMap.synced || 0;
    const failed = queueMap.failed || 0;
    const totalQueued = pending + processing + synced + failed;

    const progressPercent =
      totalQueued > 0 ? Math.round((synced / totalQueued) * 100) : 0;

    return NextResponse.json({
      success: true,
      summary: {
        totalDocuments: documentResult.rows[0]?.total_documents || 0,
        totalChunks: chunkResult.rows[0]?.total_chunks || 0,
        totalQueued,
        pending,
        processing,
        synced,
        failed,
        progressPercent,
        isProcessing: processing > 0,
        isComplete: totalQueued > 0 && pending === 0 && processing === 0,
      },
      latestJob: latestJobResult.rows[0] || null,
      recentFailures: recentFailuresResult.rows,
    });
  } catch (error: any) {
    console.error("AI tool sync status error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load sync status",
      },
      { status: 500 }
    );
  }
}