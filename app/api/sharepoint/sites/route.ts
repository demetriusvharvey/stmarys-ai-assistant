import { NextResponse } from "next/server";
import { getGraphAccessToken } from "@/lib/microsoftGraph";

export async function GET() {
  try {
    const token = await getGraphAccessToken();

    const res = await fetch(
      "https://graph.microsoft.com/v1.0/sites?search=*",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(JSON.stringify(data));
    }

    return NextResponse.json({
      success: true,
      sites: data.value.map((site: any) => ({
        id: site.id,
        name: site.name,
        displayName: site.displayName,
        webUrl: site.webUrl,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}