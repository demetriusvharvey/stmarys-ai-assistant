import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getGraphAccessToken } from "@/lib/microsoftGraph";

export const runtime = "nodejs";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

type GraphSite = {
  id: string;
  name?: string;
  displayName?: string;
  webUrl?: string;
};

type GraphDrive = {
  id: string;
  name?: string;
  webUrl?: string;
};

type GraphDriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  file?: unknown;
  folder?: unknown;
};

type SharePointDocumentRow = {
  id: string;
  title: string;
  external_id: string;
};

const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt"];

function isSupportedFile(name: string) {
  const lower = name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

async function graphGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Graph request failed: ${res.status} ${text}`);
  }

  return JSON.parse(text);
}

async function getAllPages(url: string, token: string) {
  const rows: any[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const data = await graphGet(nextUrl, token);

    if (Array.isArray(data.value)) {
      rows.push(...data.value);
    }

    nextUrl = data["@odata.nextLink"] || null;
  }

  return rows;
}

async function listAllSites(token: string): Promise<GraphSite[]> {
  const url = `${GRAPH_BASE}/sites?search=*`;
  return await getAllPages(url, token);
}

async function listSiteDrives(siteId: string, token: string): Promise<GraphDrive[]> {
  const url = `${GRAPH_BASE}/sites/${siteId}/drives`;
  return await getAllPages(url, token);
}

async function listDriveItemsRecursive(
  driveId: string,
  token: string,
  itemId = "root"
): Promise<GraphDriveItem[]> {
  const allItems: GraphDriveItem[] = [];

  const url =
    itemId === "root"
      ? `${GRAPH_BASE}/drives/${driveId}/root/children`
      : `${GRAPH_BASE}/drives/${driveId}/items/${itemId}/children`;

  const children = await getAllPages(url, token);

  for (const item of children) {
    if (item.file && isSupportedFile(item.name)) {
      allItems.push(item);
    }

    if (item.folder) {
      const nestedItems = await listDriveItemsRecursive(driveId, token, item.id);
      allItems.push(...nestedItems);
    }
  }

  return allItems;
}

export async function POST() {
  try {
    const token = await getGraphAccessToken();

    const sites = await listAllSites(token);

    const currentExternalIds = new Set<string>();

    let scannedSites = 0;
    let scannedDrives = 0;
    let currentSupportedFiles = 0;
    let skippedSites = 0;
    let skippedDrives = 0;

    for (const site of sites) {
      scannedSites += 1;

      try {
        const drives = await listSiteDrives(site.id, token);

        for (const drive of drives) {
          scannedDrives += 1;

          try {
            const items = await listDriveItemsRecursive(drive.id, token);

            for (const item of items) {
              currentSupportedFiles += 1;

              const externalId = `${drive.id}:${item.id}`;
              currentExternalIds.add(externalId);
            }
          } catch (error) {
            skippedDrives += 1;
            console.warn(
              `Skipping drive during reconciliation: ${drive.name || drive.id}`,
              error
            );
          }
        }
      } catch (error) {
        skippedSites += 1;
        console.warn(
          `Skipping site during reconciliation: ${site.displayName || site.id}`,
          error
        );
      }
    }

    const activeSharePointDocs = await db.query(
      `
      select id, title, external_id
      from documents
      where
        is_active = true
        and external_id is not null
        and external_id <> ''
      `
    );

    const activeDocs = activeSharePointDocs.rows as SharePointDocumentRow[];

    const missingDocs = activeDocs.filter(
      (doc) => !currentExternalIds.has(doc.external_id)
    );

    if (missingDocs.length > 0) {
      const missingIds = missingDocs.map((doc) => doc.id);

      await db.query(
        `
        update documents
        set
          is_active = false,
          archived_at = now(),
          archived_reason = 'missing_from_sharepoint_reconciliation'
        where id = any($1::uuid[])
        `,
        [missingIds]
      );
    }

    return NextResponse.json({
      success: true,
      scannedSites,
      scannedDrives,
      skippedSites,
      skippedDrives,
      currentSupportedFiles,
      activeSharePointDocumentsInDatabase: activeDocs.length,
      archivedMissingDocuments: missingDocs.length,
      archivedPreview: missingDocs.slice(0, 25).map((doc) => ({
        id: doc.id,
        title: doc.title,
        externalId: doc.external_id,
      })),
    });
  } catch (error: any) {
    console.error("SharePoint reconcile error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to reconcile SharePoint documents",
      },
      { status: 500 }
    );
  }
}
