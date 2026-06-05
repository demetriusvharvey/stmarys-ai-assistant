import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type UnreadableDocumentRow = {
  document_id: string;
  title: string;
  category: string | null;
  source_url: string | null;
  site_id: string;
  site_name: string;
  drive_id: string;
  item_id: string;
  item_name: string;
  web_url: string | null;
  mime_type: string | null;
};

function getLimit(value: unknown) {
  const parsed = Number(value || DEFAULT_LIMIT);

  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;

  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

async function findUnreadableDocuments(limit: number) {
  const result = await db.query(
    `
    with zero_chunk_documents as (
      select
        d.id as document_id,
        d.title,
        d.category,
        d.source_url,
        d.external_id
      from documents d
      left join document_chunks dc
        on dc.document_id = d.id
      where
        d.is_active = true
        and d.source = 'sharepoint'
        and d.external_id is not null
      group by d.id
      having count(dc.id) = 0
    ),
    latest_sync_items as (
      select distinct on (drive_id, item_id)
        drive_id,
        item_id,
        site_id,
        site_name,
        item_name,
        web_url,
        mime_type,
        created_at
      from sync_job_items
      order by drive_id, item_id, created_at desc
    )
    select
      z.document_id,
      z.title,
      z.category,
      z.source_url,
      s.site_id,
      s.site_name,
      s.drive_id,
      s.item_id,
      coalesce(s.item_name, z.title) as item_name,
      coalesce(s.web_url, z.source_url) as web_url,
      s.mime_type
    from zero_chunk_documents z
    join latest_sync_items s
      on z.external_id = s.drive_id || ':' || s.item_id
    where not exists (
      select 1
      from sync_job_items pending
      where
        pending.drive_id = s.drive_id
        and pending.item_id = s.item_id
        and pending.status in ('pending', 'processing')
    )
    order by z.title asc
    limit $1
    `,
    [limit]
  );

  return result.rows as UnreadableDocumentRow[];
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const limit = getLimit(body.limit);
    const documents = await findUnreadableDocuments(limit);

    if (documents.length === 0) {
      return NextResponse.json({
        success: true,
        queued: 0,
        message: "No unreadable active SharePoint documents found to reindex.",
        documents: [],
      });
    }

    const jobResult = await db.query(
      `
      insert into sync_jobs (
        type,
        status,
        started_at,
        total_items,
        supported_files
      )
      values (
        $1,
        $2,
        now(),
        $3,
        $3
      )
      returning id
      `,
      ["sharepoint_reindex_unreadable", "pending", documents.length]
    );

    const jobId = jobResult.rows[0]?.id;

    if (!jobId) {
      throw new Error("Unreadable document reindex job was not created.");
    }

    for (const document of documents) {
      await db.query(
        `
        insert into sync_job_items (
          job_id,
          site_id,
          site_name,
          drive_id,
          item_id,
          item_name,
          web_url,
          mime_type,
          status
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          'pending'
        )
        `,
        [
          jobId,
          document.site_id,
          document.site_name,
          document.drive_id,
          document.item_id,
          document.item_name,
          document.web_url,
          document.mime_type,
        ]
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      queued: documents.length,
      message: `${documents.length} unreadable active SharePoint documents queued for reindexing.`,
      documents: documents.map((document) => ({
        id: document.document_id,
        title: document.title,
        category: document.category,
        sourceUrl: document.web_url,
      })),
    });
  } catch (error: any) {
    console.error("Reindex unreadable documents error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Failed to queue unreadable active SharePoint documents.",
      },
      { status: 500 }
    );
  }
}
