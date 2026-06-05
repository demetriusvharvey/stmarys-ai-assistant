import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getEmployee,
  getPtoBalances,
  isPaylocityConfigured,
} from "@/lib/integrations/paylocity/client";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isPaylocityConfigured()) {
    return NextResponse.json({ error: "Paylocity is not configured." }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const employeeId = searchParams.get("employeeId");

  if (!employeeId) {
    return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  }

  // Non-admins can only look up their own data
  if (session.role !== "admin" && session.role !== "it_staff") {
    // Would need employee ID mapping — return limited self-service
    return NextResponse.json({ error: "Access restricted." }, { status: 403 });
  }

  try {
    const [employee, pto] = await Promise.allSettled([
      getEmployee(employeeId),
      getPtoBalances(employeeId),
    ]);

    return NextResponse.json({
      success: true,
      employee: employee.status === "fulfilled" ? employee.value : null,
      pto: pto.status === "fulfilled" ? pto.value : null,
      errors: {
        employee: employee.status === "rejected" ? (employee.reason as Error).message : null,
        pto: pto.status === "rejected" ? (pto.reason as Error).message : null,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
