/**
 * Paylocity API Client
 * Docs: https://developer.paylocity.com/integrations/reference/
 *
 * Required env vars:
 *   PAYLOCITY_CLIENT_ID
 *   PAYLOCITY_CLIENT_SECRET
 *   PAYLOCITY_COMPANY_ID
 *   PAYLOCITY_ENV  (production | mock)  — defaults to "production"
 */

export class PaylocityError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "PaylocityError";
  }
}

type TokenCache = { accessToken: string; expiresAt: number };
let _tokenCache: TokenCache | null = null;

function getConfig() {
  const clientId     = process.env.PAYLOCITY_CLIENT_ID;
  const clientSecret = process.env.PAYLOCITY_CLIENT_SECRET;
  const companyId    = process.env.PAYLOCITY_COMPANY_ID;
  const env          = process.env.PAYLOCITY_ENV ?? "production";

  if (!clientId || !clientSecret || !companyId) {
    throw new PaylocityError(
      "Paylocity is not configured. Set PAYLOCITY_CLIENT_ID, PAYLOCITY_CLIENT_SECRET, and PAYLOCITY_COMPANY_ID."
    );
  }

  const base = env === "mock"
    ? "https://apisandbox.paylocity.com"
    : "https://api.paylocity.com";

  return { clientId, clientSecret, companyId, base };
}

async function getAccessToken(): Promise<string> {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 30_000) {
    return _tokenCache.accessToken;
  }

  const { clientId, clientSecret, base } = getConfig();
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${base}/IdentityServer/connect/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${creds}`,
    },
    body: "grant_type=client_credentials&scope=WebLinkAPI",
  });

  if (!res.ok) {
    throw new PaylocityError(`Paylocity auth failed: HTTP ${res.status}`, res.status);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  _tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function apiFetch<T>(path: string): Promise<T> {
  const { base, companyId } = getConfig();
  const token = await getAccessToken();

  const res = await fetch(`${base}/api/v2/companies/${companyId}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PaylocityError(`Paylocity API error: HTTP ${res.status} ${body}`, res.status);
  }

  return res.json() as Promise<T>;
}

// ─── Employee ─────────────────────────────────────────────────────────────────

export type PaylocityEmployee = {
  employeeId: string;
  firstName: string;
  lastName: string;
  departmentDescription: string;
  supervisorId: string;
  hireDate: string;
  status: string;
  primaryPayRate?: {
    annualSalary?: number;
    payType?: string;
    payRate?: number;
  };
};

export async function getEmployee(employeeId: string): Promise<PaylocityEmployee> {
  return apiFetch<PaylocityEmployee>(`/employees/${employeeId}`);
}

export async function getAllEmployees(): Promise<PaylocityEmployee[]> {
  return apiFetch<PaylocityEmployee[]>("/employees");
}

// ─── PTO / Time Off ───────────────────────────────────────────────────────────

export type PtoBalance = {
  employeeId: string;
  balances: Array<{
    accruedBalance: number;
    accruedBalanceCurrentYear: number;
    usedBalance: number;
    usedBalanceCurrentYear: number;
    timeOffCode: string;
    timeOffDescription: string;
    carriedOverBalance: number;
  }>;
};

export async function getPtoBalances(employeeId: string): Promise<PtoBalance> {
  return apiFetch<PtoBalance>(`/employees/${employeeId}/localTaxes`);
}

export async function getEmployeeScheduledEarnings(employeeId: string) {
  return apiFetch(`/employees/${employeeId}/scheduledEarnings`);
}

// ─── Pay ──────────────────────────────────────────────────────────────────────

export type PayStatement = {
  employeeId: string;
  checkDate: string;
  grossPay: number;
  netPay: number;
  deductions: Array<{ code: string; amount: number }>;
  earnings: Array<{ code: string; hours: number; amount: number }>;
};

export async function getPayStatements(employeeId: string, year: number): Promise<PayStatement[]> {
  return apiFetch<PayStatement[]>(`/employees/${employeeId}/payStatements/${year}`);
}

// ─── Departments ──────────────────────────────────────────────────────────────

export type Department = {
  companyId: string;
  departmentId: string;
  description: string;
};

export async function getDepartments(): Promise<Department[]> {
  return apiFetch<Department[]>("/customFields/employee");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isPaylocityConfigured(): boolean {
  return Boolean(
    process.env.PAYLOCITY_CLIENT_ID &&
    process.env.PAYLOCITY_CLIENT_SECRET &&
    process.env.PAYLOCITY_COMPANY_ID
  );
}
