import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getGraphAccessToken } from "@/lib/microsoftGraph";

const SUPPORTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ".csv",
];

function isSupportedFile(name: string) {
  const lower = name.toLowerCase();

  return SUPPORTED_EXTENSIONS.some((ext) =>
    lower.endsWith(ext)
  );
}

async function graphGet(
  url: string,
  token: string
) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();

    throw new Error(
      `Graph request failed: ${res.status} ${text}`
    );
  }

  return res.json();
}

async function listAllGraphPages(
  url: string,
  token: string
) {
  const results: any[] = [];

  let nextUrl: string | null = url;

  while (nextUrl) {
    const data = await graphGet(
      nextUrl,
      token
    );

    results.push(...(data.value || []));

    nextUrl =
      data["@odata.nextLink"] || null;
  }

  return results;
}

async function walkDriveChildren({
  token,
  siteId,
  driveId,
  parentItemId,
  siteName,
  jobId,
  counters,
}: {
  token: string;
  siteId: string;
  driveId: string;
  parentItemId?: string;
  siteName: string;
  jobId: string;
  counters: {
    totalItems: number;
    supportedFiles: number;
  };
}) {
  const url = parentItemId
    ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentItemId}/children`
    : `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`;

  const children =
    await listAllGraphPages(
      url,
      token
    );

  for (const item of children) {
    counters.totalItems++;

    if (item.folder) {
      try {
        await walkDriveChildren({
          token,
          siteId,
          driveId,
          parentItemId: item.id,
          siteName,
          jobId,
          counters,
        });
      } catch (folderError: any) {
        console.warn(
          `Skipping folder ${item.name}:`,
          folderError.message
        );
      }
    }

    if (
      item.file &&
      isSupportedFile(item.name)
    ) {
      counters.supportedFiles++;

      try {
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
            siteId,
            siteName,
            driveId,
            item.id,
            item.name,
            item.webUrl || null,
            item.file?.mimeType || null,
          ]
        );
      } catch (insertError: any) {
        console.warn(
          `Failed inserting ${item.name}:`,
          insertError.message
        );
      }
    }
  }
}

export async function POST() {
  let jobId: string | null = null;

  try {
    const jobResult =
      await db.query(
        `
        insert into sync_jobs (
          type,
          status,
          started_at
        )
        values (
          $1,
          $2,
          now()
        )
        returning id
        `,
        ["sharepoint", "discovering"]
      );

    jobId = jobResult.rows[0].id;

    const token =
      await getGraphAccessToken();

    const sites =
      await listAllGraphPages(
        "https://graph.microsoft.com/v1.0/sites?search=*",
        token
      );

    const counters = {
      totalItems: 0,
      supportedFiles: 0,
    };

    await db.query(
      `
      update sync_jobs
      set total_sites = $1
      where id = $2
      `,
      [sites.length, jobId]
    );

    for (const site of sites) {
      const siteName =
        site.displayName ||
        site.name ||
        site.id;

      try {
        await db.query(
          `
          update sync_jobs
          set current_site = $1
          where id = $2
          `,
          [siteName, jobId]
        );

        const drives =
          await listAllGraphPages(
            `https://graph.microsoft.com/v1.0/sites/${site.id}/drives`,
            token
          );

        for (const drive of drives) {
          try {
            await walkDriveChildren({
              token,
              siteId: site.id,
              driveId: drive.id,
              siteName,
              jobId,
              counters,
            });

            await db.query(
              `
              update sync_jobs
              set
                total_items = $1,
                supported_files = $2
              where id = $3
              `,
              [
                counters.totalItems,
                counters.supportedFiles,
                jobId,
              ]
            );
          } catch (driveError: any) {
            console.warn(
              `Skipping drive ${
                drive.name || drive.id
              } on site ${siteName}:`,
              driveError.message
            );
          }
        }
      } catch (siteError: any) {
        console.warn(
          `Skipping site ${siteName}:`,
          siteError.message
        );
      }
    }

    await db.query(
      `
      update sync_jobs
      set
        status = 'pending',
        total_items = $1,
        supported_files = $2,
        current_site = null
      where id = $3
      `,
      [
        counters.totalItems,
        counters.supportedFiles,
        jobId,
      ]
    );

    return NextResponse.json({
      success: true,
      jobId,
      message:
        "SharePoint discovery completed. Files queued for sync.",
      totalSites: sites.length,
      totalItems:
        counters.totalItems,
      supportedFiles:
        counters.supportedFiles,
    });
  } catch (error: any) {
    console.error(
      "Create sync job error:",
      error
    );

    if (jobId) {
      await db.query(
        `
        update sync_jobs
        set
          status = 'failed',
          error = $1,
          completed_at = now()
        where id = $2
        `,
        [
          error.message ||
            "Failed to create sync job",
          jobId,
        ]
      );
    }

    return NextResponse.json(
      {
        success: false,
        jobId,
        error:
          error.message ||
          "Failed to create sync job",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const jobsResult =
      await db.query(
        `
        select
          id,
          type,
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
        limit 20
        `
      );

    return NextResponse.json({
      success: true,
      jobs: jobsResult.rows,
    });
  } catch (error: any) {
    console.error(
      "List sync jobs error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Failed to list sync jobs",
      },
      { status: 500 }
    );
  }
}