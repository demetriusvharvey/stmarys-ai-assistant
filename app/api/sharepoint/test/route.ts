import { NextResponse } from "next/server";
import { getGraphAccessToken } from "@/lib/microsoftGraph";

export async function GET() {
  try {
    const token = await getGraphAccessToken();

    return NextResponse.json({
      success: true,
      message: "Microsoft Graph auth is working",
      tokenPreview: `${token.slice(0, 20)}...`,
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