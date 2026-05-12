import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { success: false, error: "Missing jobId" },
        { status: 400 }
      );
    }

    const jobResult = await db.query(
      `
      select *
      from sync_jobs
      where id = $1
      limit 1
      `,
      [jobId]
    );

    if (jobResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Sync job not found" },
        { status: 404 }
      );
    }

    const countsResult = await db.query(
      `
      select
        count(*)::int as total,
        count(*) filter (where status = 'pending')::int as pending,
        count(*) filter (where status = 'processing')::int as processing,
        count(*) filter (where status = 'synced')::int as synced,
        count(*) filter (where status = 'failed')::int as failed
      from sync_job_items
      where job_id = $1
      `,
      [jobId]
    );

    return NextResponse.json({
      success: true,
      job: jobResult.rows[0],
      counts: countsResult.rows[0],
    });
  } catch (error: any) {
    console.error("Sync status error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get sync status",
      },
      { status: 500 }
    );
  }
}