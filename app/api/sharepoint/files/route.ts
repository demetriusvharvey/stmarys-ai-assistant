import { NextResponse } from "next/server";
import { getGraphAccessToken } from "@/lib/microsoftGraph";

async function listChildren(
  token: string,
  siteId: string,
  itemId: string = "root",
  folderPath: string = ""
): Promise<any[]> {
  const url =
    itemId === "root"
      ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`
      : `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/children`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }

  let results: any[] = [];

  for (const item of data.value || []) {
    const currentPath = folderPath
      ? `${folderPath}/${item.name}`
      : item.name;

    results.push({
      id: item.id,
      name: item.name,
      path: currentPath,
      webUrl: item.webUrl,
      isFolder: Boolean(item.folder),
      isFile: Boolean(item.file),
      mimeType: item.file?.mimeType || null,
    });

    if (item.folder) {
      const nested = await listChildren(
        token,
        siteId,
        item.id,
        currentPath
      );

      results = results.concat(nested);
    }
  }

  return results;
}

export async function GET() {
  try {
    const token = await getGraphAccessToken();

    const siteId =
      "smhdc.sharepoint.com,b151d307-1695-4f85-b26c-e6d1deda89de,b905df15-9b66-4077-8a0e-f41b1e8048d0";

    const files = await listChildren(token, siteId);

    return NextResponse.json({
      success: true,
      count: files.length,
      files,
    });
  } catch (error: any) {
    console.error("SHAREPOINT_FILES_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}