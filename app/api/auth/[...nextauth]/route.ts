// NextAuth has been replaced with custom JWT auth (lib/session.ts).
// This route is kept as a stub to avoid 404 confusion during migration.
import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ error: "Not found" }, { status: 404 }); }
export async function POST() { return NextResponse.json({ error: "Not found" }, { status: 404 }); }
