import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getGraphAccessToken } from "@/lib/microsoftGraph";

export const runtime = "nodejs";

const CARETRACKER_TERMS = ["caretracker", "care tracker", "caretacker"];
const PRIORITY_CREATED_AT = "2000-01-01T00:00:00.000Z";
const DEFAULT_MAX_SITES = 75;
const MAX_SITES = 150;
const DEFAULT_MAX_ITEMS = 20;
const MAX_ITEMS = 50;

type SharePointSite = {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
};

type SharePointSearchItem = {
  siteId: string;
  siteName: string;
  driveId: string;
  itemId: string;
  itemName: string;
  webUrl: string | null;
  mimeType: string | null;
};

function getBoundedNumber(value: unknown, fallback: number, max: number) {
  const parsed = Number(value || fallback);

  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

  return Math.min(Math.floor(parsed), max);
}

function isSupportedFile(name: string) {
  const lower = name.toLowerCase();

  return (
    lower.endsWith(".pdf") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".docx")
  );
}

function shouldSkipSite(site: SharePointSite) {
  const value = `${site.name || ""} ${site.displayName || ""} ${
    site.webUrl || ""
  }`.toLowerCase();

  return (
    value.includes("/contentstorage/") ||
    value.includes("contentstorage") ||
    value.includes("designer") ||
    value.includes("my workspace") ||
    value.includes("appcatalog")
  );
}

function shouldSkipPossiblePhiSource(item: SharePointSearchItem) {
  const value = `${item.itemName || ""} ${item.siteName || ""} ${
    item.webUrl || ""
  }`.toLowerCase();

  return [
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
  ].some((term) => value.includes(term));
}

function isCareTrackerItem(item: SharePointSearchItem) {
  const value = `${item.itemName || ""} ${item.webUrl || ""}`.toLowerCase();

  return CARETRACKER_TERMS.some((term) => value.includes(term));
}

async function graphFetchJson(token: string, url: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error?.message || JSON.stringify(data));
  }

  return data;
}

async function getSites(token: string, maxSites: number) {
  const sites: SharePointSite[] = [];
  let url = "https://graph.microsoft.com/v1.0/sites?search=*";

  while (url && sites.length < maxSites) {
    const data = await graphFetchJson(token, url);

    for (const site of data.value || []) {
      const mappedSite = {
        id: site.id,
        name: site.name,
        displayName: site.displayName || site.name,
        webUrl: site.webUrl,
      };

      if (!shouldSkipSite(mappedSite)) {
        sites.push(mappedSite);
      }

      if (sites.length >= maxSites) break;
    }

    url = data["@odata.nextLink"] || "";
  }

  return sites;
}

async function searchSiteDrive(
  token: string,
  site: SharePointSite,
  term: string
) {
  const encodedTerm = encodeURIComponent(`'${term}'`);
  const url = `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root/search(q=${encodedTerm})`;
  const data = await graphFetchJson(token, url);
  const results: SharePointSearchItem[] = [];

  for (const item of data.value || []) {
    const driveId = item.parentReference?.driveId;

    if (!item.file || !driveId || !isSupportedFile(item.name || "")) continue;

    const mappedItem = {
      siteId: site.id,
      siteName: site.displayName || site.name,
      driveId,
      itemId: item.id,
      itemName: item.name,
      webUrl: item.webUrl || null,
      mimeType: item.file?.mimeType || null,
    };

    if (isCareTrackerItem(mappedItem)) {
      results.push(mappedItem);
    }
  }

  return results;
}

async function findCareTrackerDocumentRecords() {
  const result = await db.query(
    `
    select
      d.id,
      d.title,
      d.category,
      d.source,
      d.external_id,
      d.source_url,
      count(dc.id)::int as chunks
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
    order by d.title asc
    `,
    [["%caretracker%", "%care tracker%"]]
  );

  return result.rows;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const maxSites = getBoundedNumber(
      body.maxSites,
      DEFAULT_MAX_SITES,
      MAX_SITES
    );
    const maxItems = getBoundedNumber(
      body.maxItems,
      DEFAULT_MAX_ITEMS,
      MAX_ITEMS
    );

    const token = await getGraphAccessToken();
    const sites = await getSites(token, maxSites);
    const recordsBefore = await findCareTrackerDocumentRecords();

    const foundItemsByKey = new Map<string, SharePointSearchItem>();

    for (const site of sites) {
      for (const term of CARETRACKER_TERMS) {
        const items = await searchSiteDrive(token, site, term).catch(() => []);

        for (const item of items) {
          const key = `${item.driveId}:${item.itemId}`;

          if (!foundItemsByKey.has(key) && !shouldSkipPossiblePhiSource(item)) {
            foundItemsByKey.set(key, item);
          }
        }
      }
    }

    const foundItems = Array.from(foundItemsByKey.values()).slice(0, maxItems);

    if (foundItems.length === 0) {
      return NextResponse.json({
        success: true,
        jobId: null,
        found: 0,
        queued: 0,
        message: "No CareTracker SharePoint files found by Graph search.",
        recordsBefore,
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
      values ($1, $2, now(), $3, $3)
      returning id
      `,
      ["sharepoint_relink_caretracker", "pending", foundItems.length]
    );

    const jobId = jobResult.rows[0]?.id;

    if (!jobId) {
      throw new Error("CareTracker relink job was not created.");
    }

    let queued = 0;
    let movedExisting = 0;

    for (const item of foundItems) {
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
        [item.driveId, item.itemId, PRIORITY_CREATED_AT]
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
        values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
        `,
        [
          jobId,
          item.siteId,
          item.siteName,
          item.driveId,
          item.itemId,
          item.itemName,
          item.webUrl,
          item.mimeType,
          PRIORITY_CREATED_AT,
        ]
      );

      queued++;
    }

    return NextResponse.json({
      success: true,
      jobId,
      sitesScanned: sites.length,
      found: foundItems.length,
      queued,
      movedExisting,
      message: `${foundItems.length} CareTracker SharePoint files found and moved to the front of the sync queue.`,
      files: foundItems.map((item) => ({
        title: item.itemName,
        siteName: item.siteName,
        sourceUrl: item.webUrl,
      })),
      recordsBefore,
    });
  } catch (error: any) {
    console.error("CareTracker relink error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Failed to search and queue CareTracker SharePoint files.",
      },
      { status: 500 }
    );
  }
}
