import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) {
    throw new Error("Email is not configured. Set SMTP_HOST in .env.local");
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // Supports both authenticated SMTP and unauthenticated relay (M365 MX endpoint)
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 25),
    secure: process.env.SMTP_SECURE === "true",
    tls: { rejectUnauthorized: false },
    ...(user && pass ? { auth: { user, pass } } : {}),
  } as Parameters<typeof nodemailer.createTransport>[0]);
}

const FROM = process.env.SMTP_FROM ?? "noreply@smhdc.org";
const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

// ─── Welcome / account creation ──────────────────────────────────────────────

export async function sendWelcomeEmail({
  to,
  displayName,
  tempPassword,
  role,
}: {
  to: string;
  displayName: string;
  tempPassword: string;
  role: string;
}) {
  const loginUrl = `${APP_URL}/login`;
  const roleLabel =
    role === "admin" ? "Administrator" : role === "it_staff" ? "IT Staff" : "Staff";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">

        <!-- Header -->
        <tr>
          <td style="background:#0f766e;padding:28px 32px;">
            <img src="https://saintmaryshome.org/wp-content/uploads/2025/05/SMH-Logo-2025_LinearStackedTagline-Color.svg"
                 alt="St. Mary's Home" height="40" style="display:block;" />
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:bold;color:#0f172a;">
              Welcome, ${displayName}!
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
              Your St. Mary's AI Workforce account has been created.
              Use the credentials below to log in for the first time.
            </p>

            <!-- Credentials box -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#64748b;padding-bottom:6px;font-weight:600;
                                 letter-spacing:0.05em;text-transform:uppercase;">Email</td>
                    </tr>
                    <tr>
                      <td style="font-size:15px;color:#0f172a;padding-bottom:16px;">${to}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#64748b;padding-bottom:6px;font-weight:600;
                                 letter-spacing:0.05em;text-transform:uppercase;">Temporary Password</td>
                    </tr>
                    <tr>
                      <td style="font-size:18px;font-family:monospace;color:#0f172a;
                                 background:#fff;border:1px solid #cbd5e1;border-radius:6px;
                                 padding:8px 14px;letter-spacing:0.08em;">${tempPassword}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#64748b;padding-bottom:6px;padding-top:16px;
                                 font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">Role</td>
                    </tr>
                    <tr>
                      <td style="font-size:15px;color:#0f172a;">${roleLabel}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:#0f766e;border-radius:8px;">
                  <a href="${loginUrl}"
                     style="display:block;padding:14px 28px;font-size:15px;font-weight:600;
                            color:#ffffff;text-decoration:none;">
                    Log In Now →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">
              You will be prompted to change your password after your first login.
              If you didn't expect this email, contact your administrator.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e5e5e5;
                     padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">
              St. Mary's Home &bull; AI Workforce &bull;
              <a href="${loginUrl}" style="color:#0f766e;text-decoration:none;">${APP_URL}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
Welcome to St. Mary's AI Workforce, ${displayName}!

Your account has been created. Use the details below to log in:

  Email:              ${to}
  Temporary Password: ${tempPassword}
  Role:               ${roleLabel}

Log in at: ${loginUrl}

You will be prompted to change your password after your first login.
  `.trim();

  const transport = getTransport();
  await transport.sendMail({
    from: `"St. Mary's AI Workforce" <${FROM}>`,
    to,
    subject: "Your St. Mary's AI Workforce Account",
    text,
    html,
  });
}

// ─── Password reset ────────────────────────────────────────────────────────

export async function sendPasswordResetEmail({
  to,
  displayName,
  newPassword,
}: {
  to: string;
  displayName: string;
  newPassword: string;
}) {
  const loginUrl = `${APP_URL}/login`;

  const text = `
Hi ${displayName},

Your St. Mary's AI Workforce password has been reset by an administrator.

  Email:        ${to}
  New Password: ${newPassword}

Log in at: ${loginUrl}

Please change your password after logging in.
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;
              padding:32px;border:1px solid #e5e5e5;">
    <p style="font-size:20px;font-weight:bold;color:#0f172a;margin:0 0 16px;">
      Password Reset — St. Mary's AI Workforce
    </p>
    <p style="color:#475569;margin:0 0 24px;">Hi ${displayName}, your password was reset by an administrator.</p>
    <table style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                  width:100%;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 4px;font-size:12px;color:#64748b;text-transform:uppercase;
                  font-weight:600;letter-spacing:0.05em;">New Password</p>
        <p style="margin:0;font-size:18px;font-family:monospace;background:#fff;
                  border:1px solid #cbd5e1;border-radius:6px;padding:8px 14px;
                  display:inline-block;">${newPassword}</p>
      </td></tr>
    </table>
    <a href="${loginUrl}"
       style="display:inline-block;background:#0f766e;color:#fff;padding:12px 24px;
              border-radius:8px;text-decoration:none;font-weight:600;">Log In →</a>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">
      Change your password after logging in.
    </p>
  </div>
</body>
</html>
  `.trim();

  const transport = getTransport();
  await transport.sendMail({
    from: `"St. Mary's AI Workforce" <${FROM}>`,
    to,
    subject: "Your password has been reset — St. Mary's AI Workforce",
    text,
    html,
  });
}

// ─── Forgot password link ────────────────────────────────────────────────────

export async function sendPasswordResetLinkEmail({
  to,
  displayName,
  resetUrl,
}: {
  to: string;
  displayName: string;
  resetUrl: string;
}) {
  const text = `Hi ${displayName},\n\nWe received a request to reset your St. Mary's AI Workforce password.\n\nReset your password here (link expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email — your password won't change.`;

  const html = `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e5e5;">
    <p style="font-size:20px;font-weight:bold;color:#0f172a;margin:0 0 16px;">Reset Your Password</p>
    <p style="color:#475569;margin:0 0 24px;">Hi ${displayName}, click the button below to reset your password. This link expires in 1 hour.</p>
    <a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-bottom:24px;">Reset Password →</a>
    <p style="margin:0;font-size:12px;color:#94a3b8;">If you didn't request a password reset, you can safely ignore this email.</p>
  </div>
</body></html>`.trim();

  const transport = getTransport();
  await transport.sendMail({
    from: `"St. Mary's AI Workforce" <${FROM}>`,
    to,
    subject: "Reset your St. Mary's AI Workforce password",
    text,
    html,
  });
}

// ─── Knowledge gap alert ────────────────────────────────────────────────────

type KnowledgeGap = {
  question: string;
  user_email?: string | null;
  agent?: string | null;
  flagged_at: string | Date;
};

export async function sendKnowledgeGapAlert({ gaps, to }: { gaps: KnowledgeGap[]; to?: string }) {
  const recipient = to || process.env.IT_SUPPORT_EMAIL || "infotechsupport@smhdc.org";
  const adminUrl = `${APP_URL}/admin/knowledge-gaps`;

  const rows = gaps
    .slice(0, 20)
    .map((g) => {
      const date = new Date(g.flagged_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${g.question.replace(/</g, "&lt;")}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${g.user_email || "—"}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${date}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">
<tr><td style="background:#0f766e;padding:24px 32px;">
  <p style="margin:0;color:#fff;font-size:18px;font-weight:bold;">🔍 Knowledge Gap Alert — St. Mary's AI Workforce</p>
</td></tr>
<tr><td style="padding:28px 32px;">
  <p style="margin:0 0 16px;font-size:15px;color:#374151;">The AI could not find internal St. Mary's documentation for <strong>${gaps.length} question(s)</strong>. These are opportunities to add content to the Knowledge Library.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
    <tr style="background:#f9fafb;">
      <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Question Asked</th>
      <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Staff Member</th>
      <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Date</th>
    </tr>
    ${rows}
  </table>
  <a href="${adminUrl}" style="display:inline-block;background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">View All Gaps in Admin →</a>
</td></tr>
<tr><td style="background:#f8fafc;border-top:1px solid #e5e5e5;padding:16px 32px;text-align:center;">
  <p style="margin:0;font-size:12px;color:#94a3b8;">St. Mary's AI Workforce · <a href="${adminUrl}" style="color:#0f766e;">Admin Panel</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const text = `Knowledge Gap Alert — St. Mary's AI Workforce\n\n${gaps.length} question(s) had no internal documentation:\n\n${gaps.slice(0, 20).map(g => `- ${g.question}`).join("\n")}\n\nView and manage: ${adminUrl}`;

  const transport = getTransport();
  await transport.sendMail({
    from: `"St. Mary's AI Workforce" <${FROM}>`,
    to: recipient,
    subject: `🔍 ${gaps.length} Knowledge Gap(s) — St. Mary's AI Workforce`,
    text,
    html,
  });
}

// ─── Weekly digest ───────────────────────────────────────────────────────────

type DigestStats = {
  totalQuestions: number;
  activeUsers: number;
  knowledgeGaps: number;
  topQuestions: { question: string; count: number }[];
  topAgents: { agent: string; count: number }[];
  newGaps: { question: string; user_email?: string | null; flagged_at: string | Date }[];
};

export function buildWeeklyDigestEmail(stats: DigestStats): { html: string; text: string } {
  const adminUrl = `${APP_URL}/admin/dashboard`;
  const gapUrl = `${APP_URL}/admin/knowledge-gaps`;
  const weekStr = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const topQRows = stats.topQuestions.slice(0, 8).map((q, i) =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;">${i + 1}.</td>` +
    `<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">${q.question.replace(/</g, "&lt;").slice(0, 80)}</td>` +
    `<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#0f766e;text-align:right;font-weight:600;">${q.count}x</td></tr>`
  ).join("");

  const agentRows = stats.topAgents.slice(0, 6).map((a) =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-transform:capitalize;">${a.agent.replace(/_/g, " ")}</td>` +
    `<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;text-align:right;">${a.count}</td></tr>`
  ).join("");

  const gapItems = stats.newGaps.slice(0, 10).map((g) =>
    `<li style="margin-bottom:6px;font-size:14px;color:#374151;">${g.question.replace(/</g, "&lt;").slice(0, 90)}</li>`
  ).join("");

  const html = [
    "<!DOCTYPE html><html><body style=\"margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;\">",
    "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f4f4f4;padding:32px 0;\">",
    "<tr><td align=\"center\">",
    "<table width=\"620\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;\">",
    "<tr><td style=\"background:#0f766e;padding:28px 32px;\">",
    "  <p style=\"margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:13px;\">Weekly Report &middot; " + weekStr + "</p>",
    "  <p style=\"margin:0;color:#fff;font-size:22px;font-weight:bold;\">St. Mary's AI Workforce &mdash; Weekly Digest</p>",
    "</td></tr>",
    "<tr><td style=\"padding:28px 32px;\">",
    "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-bottom:28px;\"><tr>",
    "  <td width=\"33%\" style=\"text-align:center;padding:16px;background:#f0fdf4;border-radius:8px;\">",
    "    <p style=\"margin:0;font-size:32px;font-weight:bold;color:#0f766e;\">" + stats.totalQuestions + "</p>",
    "    <p style=\"margin:4px 0 0;font-size:13px;color:#6b7280;\">Questions This Week</p></td>",
    "  <td width=\"4%\"></td>",
    "  <td width=\"33%\" style=\"text-align:center;padding:16px;background:#f0f9ff;border-radius:8px;\">",
    "    <p style=\"margin:0;font-size:32px;font-weight:bold;color:#0284c7;\">" + stats.activeUsers + "</p>",
    "    <p style=\"margin:4px 0 0;font-size:13px;color:#6b7280;\">Active Staff</p></td>",
    "  <td width=\"4%\"></td>",
    "  <td width=\"33%\" style=\"text-align:center;padding:16px;background:#fff7ed;border-radius:8px;\">",
    "    <p style=\"margin:0;font-size:32px;font-weight:bold;color:#ea580c;\">" + stats.knowledgeGaps + "</p>",
    "    <p style=\"margin:4px 0 0;font-size:13px;color:#6b7280;\">Knowledge Gaps</p></td>",
    "</tr></table>",
    topQRows ? "<p style=\"margin:0 0 10px;font-size:15px;font-weight:bold;color:#111827;\">Top Questions</p>" +
      "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;\">" +
      topQRows + "</table>" : "",
    agentRows ? "<p style=\"margin:0 0 10px;font-size:15px;font-weight:bold;color:#111827;\">Top Agents</p>" +
      "<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;\">" +
      agentRows + "</table>" : "",
    gapItems ? "<p style=\"margin:0 0 10px;font-size:15px;font-weight:bold;color:#111827;\">Recent Knowledge Gaps</p>" +
      "<ul style=\"margin:0 0 24px;padding-left:20px;\">" + gapItems + "</ul>" : "",
    "<a href=\"" + adminUrl + "\" style=\"display:inline-block;background:#0f766e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;\">View Dashboard &#8594;</a>",
    "<a href=\"" + gapUrl + "\" style=\"display:inline-block;margin-left:12px;background:#fff;color:#0f766e;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #0f766e;\">Knowledge Gaps &#8594;</a>",
    "</td></tr>",
    "<tr><td style=\"background:#f8fafc;border-top:1px solid #e5e5e5;padding:16px 32px;text-align:center;\">",
    "  <p style=\"margin:0;font-size:12px;color:#94a3b8;\">St. Mary's AI Workforce &middot; Generated " + weekStr + "</p>",
    "</td></tr>",
    "</table></td></tr></table>",
    "</body></html>",
  ].join("\n");

  const text = [
    "Weekly AI Workforce Digest — St. Mary's Home for Disabled Children",
    "Week of: " + weekStr,
    "",
    "SUMMARY",
    "Questions Asked: " + stats.totalQuestions,
    "Active Staff: " + stats.activeUsers,
    "Knowledge Gaps: " + stats.knowledgeGaps,
    "",
    stats.topQuestions.length ? "TOP QUESTIONS\n" + stats.topQuestions.slice(0, 8).map((q, i) => `${i + 1}. ${q.question} (${q.count}x)`).join("\n") : "",
    "",
    stats.topAgents.length ? "TOP AGENTS\n" + stats.topAgents.slice(0, 6).map((a) => `${a.agent.replace(/_/g, " ")}: ${a.count}`).join("\n") : "",
    "",
    stats.newGaps.length ? "RECENT KNOWLEDGE GAPS\n" + stats.newGaps.slice(0, 10).map((g) => `- ${g.question}`).join("\n") : "",
    "",
    "View dashboard: " + adminUrl,
  ].filter(Boolean).join("\n");

  return { html, text };
}

export async function sendWeeklyDigest({ to, stats }: { to: string; stats: DigestStats }) {
  const { html, text } = buildWeeklyDigestEmail(stats);
  const transport = getTransport();
  await transport.sendMail({
    from: `"St. Mary's AI Workforce" <${FROM}>`,
    to,
    subject: `Weekly AI Workforce Digest — St. Mary's Home`,
    text,
    html,
  });
}
