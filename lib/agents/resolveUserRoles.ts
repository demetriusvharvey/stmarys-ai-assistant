import type { AgentIdentity, UserRole } from "./types";

export type ResolvedUserRoles = {
  roles: UserRole[];
  tenantValidated: boolean;
  roleSource: string;
};

function parseEmailAllowlist(value?: string) {
  return new Set(
    (value || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function resolveUserRoles(
  identity?: AgentIdentity | null
): ResolvedUserRoles {
  if (!identity) {
    return {
      roles: ["service"],
      tenantValidated: false,
      roleSource: "missing_identity_service_caller",
    };
  }

  if (!identity.email || !identity.tenantId) {
    return {
      roles: ["unknown"],
      tenantValidated: false,
      roleSource: "missing_email_or_tenant",
    };
  }

  const expectedTenantId = process.env.SMH_TENANT_ID?.trim().toLowerCase();
  const tenantId = identity.tenantId.trim().toLowerCase();

  if (!expectedTenantId || tenantId !== expectedTenantId) {
    return {
      roles: ["unknown"],
      tenantValidated: false,
      roleSource: "tenant_not_validated",
    };
  }

  const email = identity.email.toLowerCase();
  const adminUsers = parseEmailAllowlist(process.env.SMH_ADMIN_USERS);
  const itUsers = parseEmailAllowlist(process.env.SMH_IT_USERS);

  if (adminUsers.has(email)) {
    return {
      roles: ["admin", "it_staff", "staff"],
      tenantValidated: true,
      roleSource: "admin_email_allowlist",
    };
  }

  if (itUsers.has(email)) {
    return {
      roles: ["it_staff", "staff"],
      tenantValidated: true,
      roleSource: "it_email_allowlist",
    };
  }

  return {
    roles: ["staff"],
    tenantValidated: true,
    roleSource: "validated_tenant_default_staff",
  };
}
