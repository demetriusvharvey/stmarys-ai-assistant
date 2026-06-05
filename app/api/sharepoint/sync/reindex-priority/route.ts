import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const PRIORITY_TARGETS = [
  {
    label: "HR handbook",
    patterns: ["%handbook%"],
  },
  {
    label: "Orientation",
    patterns: ["%orientation%"],
  },
  {
    label: "CareTracker",
    patterns: ["%caretracker%", "%care tracker%"],
  },
  {
    label: "SigmaCare",
    patterns: ["%sigmacare%"],
  },
  {
    label: "Incident reporting",
    patterns: ["%incident report%", "%incident reporting%"],
  },
];

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const PRIORITY_CREATED_AT = "2000-01-01T00:00:00.000Z";
const PHI_SOURCE_TERMS = [
  "clinical",
  "preadmission",
  "pre-admission",
  "resident",
  "patient",
  "medical record",
  "mrn",
  "nursing",
  "care plan",
  "face sheet",
];

type PriorityDocumentRow = {
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
  existing_pending_items: number;
};

type SkippedDocumentRow = {
  document_id: string;
  title: string;
  category: string | null;
  source_url: string | null;
  reason: string;
};

function getLimit(value: unknown) {
  const parsed = Number(value || DEFAULT_LIMIT);

  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;

  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function getPatterns(value: unknown) {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value
      .map((pattern) => pattern.trim())
      .filter(Boolean)
      .map((pattern) => `%${pattern}%`);
  }

  return PRIORITY_TARGETS.flatMap((target) => target.patterns);
}

async function findPriorityDocuments(limit: number, patterns: string[]) {
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
        and (
          d.title ilike any ($1::text[])
          or coalesce(d.category, '') ilike any ($1::text[])
          or coalesce(d.source_url, '') ilike any ($1::text[])
        )
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
    ),
    safe_zero_chunk_documents as (
      select *
      from zero_chunk_documents z
      where not exists (
        select 1
        from unnest($2::text[]) as blocked(term)
        where
          lower(z.title) like '%' || blocked.term || '%'
          or lower(coalesce(z.category, '')) like '%' || blocked.term || '%'
          or lower(coalesce(z.source_url, '')) like '%' || blocked.term || '%'
      )
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
      s.mime_type,
      (
        select count(*)::int
        from sync_job_items pending
        where
          pending.drive_id = s.drive_id
          and pending.item_id = s.item_id
          and pending.status in ('pending', 'processing')
      ) as existing_pending_items
    from safe_zero_chunk_documents z
    join latest_sync_items s
      on z.external_id = s.drive_id || ':' || s.item_id
    order by
      case
        when z.title ilike '%handbook%' then 1
        when z.title ilike '%orientation%' then 2
        when z.title ilike '%caretracker%' then 3
        when z.title ilike '%sigmacare%' then 4
        when z.title ilike '%incident%' then 5
        else 99
      end,
      z.title asc
    limit $3
    `,
    [patterns, PHI_SOURCE_TERMS, limit]
  );

  return result.rows as PriorityDocumentRow[];
}

async function findSkippedPriorityDocuments(patterns: string[]) {
  const result = await db.query(
    `
    with matching_documents as (
      select
        d.id as document_id,
        d.title,
        d.category,
        d.source_url,
        d.source,
        d.external_id,
        count(dc.id)::int as chunk_count
      from documents d
      left join document_chunks dc
        on dc.document_id = d.id
      where
        d.is_active = true
        and (
          d.title ilike any ($1::text[])
          or coalesce(d.category, '') ilike any ($1::text[])
          or coalesce(d.source_url, '') ilike any ($1::text[])
        )
      group by d.id
    )
    select
      document_id,
      title,
      category,
      source_url,
      case
        when exists (
          select 1
          from unnest($2::text[]) as blocked(term)
          where
            lower(title) like '%' || blocked.term || '%'
            or lower(coalesce(category, '')) like '%' || blocked.term || '%'
            or lower(coalesce(source_url, '')) like '%' || blocked.term || '%'
        )
          then 'Skipped by PHI source safety filter'
        when source <> 'sharepoint' or external_id is null
          then 'Missing SharePoint external ID/source URL; needs SharePoint resync or relink'
        else 'Already readable or queued'
      end as reason
    from matching_documents
    where
      chunk_count = 0
      and (
        source <> 'sharepoint'
        or external_id is null
        or exists (
          select 1
          from unnest($2::text[]) as blocked(term)
          where
            lower(title) like '%' || blocked.term || '%'
            or lower(coalesce(category, '')) like '%' || blocked.term || '%'
            or lower(coalesce(source_url, '')) like '%' || blocked.term || '%'
        )
      )
    order by title asc
    limit 50
    `,
    [patterns, PHI_SOURCE_TERMS]
  );

  return result.rows as SkippedDocumentRow[];
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const limit = getLimit(body.limit);
    const patterns = getPatterns(body.patterns);
    const documents = await findPriorityDocuments(limit, patterns);
    const skippedDocuments = await findSkippedPriorityDocuments(patterns);

    if (documents.length === 0) {
      return NextResponse.json({
        success: true,
        jobId: null,
        prioritized: 0,
        created: 0,
        movedExisting: 0,
        message: "No matching unreadable high-priority SharePoint documents found.",
        documents: [],
        skippedDocuments,
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
      ["sharepoint_reindex_priority", "pending", documents.length]
    );

    const jobId = jobResult.rows[0]?.id;

    if (!jobId) {
      throw new Error("Priority reindex job was not created.");
    }

    let created = 0;
    let movedExisting = 0;

    for (const document of documents) {
      const existingResult = await db.query(
        `
        update sync_job_items
        set
          status = 'pending',
          created_at = $3,
          error = null
        where
          drive_id = $1
          and item_id = $2
          and status in ('pending', 'processing')
        returning id
        `,
        [document.drive_id, document.item_id, PRIORITY_CREATED_AT]
      );

      if (existingResult.rowCount && existingResult.rowCount > 0) {
        movedExisting += existingResult.rowCount;
        continue;
      }

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
          status,
          created_at
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
          'pending',
          $9
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
          PRIORITY_CREATED_AT,
        ]
      );

      created++;
    }

    return NextResponse.json({
      success: true,
      jobId,
      prioritized: documents.length,
      created,
      movedExisting,
      message: `${documents.length} high-priority unreadable SharePoint documents moved to the front of the sync queue.`,
      targets: PRIORITY_TARGETS.map((target) => target.label),
      documents: documents.map((document) => ({
        id: document.document_id,
        title: document.title,
        category: document.category,
        sourceUrl: document.web_url,
        hadExistingPendingItem: document.existing_pending_items > 0,
      })),
      skippedDocuments,
    });
  } catch (error: any) {
    console.error("Priority reindex error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Failed to queue high-priority SharePoint documents for reindexing.",
      },
      { status: 500 }
    );
  }
}
