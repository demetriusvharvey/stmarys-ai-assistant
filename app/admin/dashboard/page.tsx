"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const LOGO_URL =
  "https://saintmaryshome.org/wp-content/uploads/2025/05/SMH-Logo-2025_LinearStackedTagline-Color.svg";

type CurrentUser = {
  name: string;
  email: string;
  role: string;
};

type AdminLink = {
  href: string;
  icon: string;
  title: string;
  description: string;
};

const adminSections: { title: string; description: string; links: AdminLink[] }[] = [
  {
    title: "Accounts",
    description: "Create, import, and manage staff access.",
    links: [
      {
        href: "/admin/users",
        icon: "👥",
        title: "Manage Accounts",
        description: "Create users, reset passwords, and manage account status.",
      },
      {
        href: "/admin/users/import",
        icon: "📥",
        title: "Bulk Import",
        description: "Upload a CSV to create staff accounts in bulk.",
      },
    ],
  },
  {
    title: "Knowledge",
    description: "Manage source content and gaps in the AI knowledge base.",
    links: [
      {
        href: "/knowledge",
        icon: "📚",
        title: "Knowledge Library",
        description: "Browse documents, source links, categories, and chunk counts.",
      },
      {
        href: "/admin/sync",
        icon: "🔄",
        title: "SharePoint Sync",
        description: "Queue and process approved SharePoint content.",
      },
      {
        href: "/admin/knowledge-gaps",
        icon: "🔍",
        title: "Knowledge Gaps",
        description: "Review questions that need better indexed source material.",
      },
    ],
  },
  {
    title: "Reports And Logs",
    description: "Review usage, feedback, and user activity.",
    links: [
      {
        href: "/admin/analytics",
        icon: "📊",
        title: "Analytics",
        description: "View usage trends, top questions, agents, and active users.",
      },
      {
        href: "/admin/audit",
        icon: "📋",
        title: "Logs",
        description: "Search every user prompt, response, source, and metadata log.",
      },
      {
        href: "/admin/feedback",
        icon: "💬",
        title: "Feedback Admin",
        description: "Review helpful, incorrect, and reported issue feedback.",
      },
    ],
  },
  {
    title: "AI Workforce",
    description: "Review agent coverage and capabilities.",
    links: [
      {
        href: "/admin/agents",
        icon: "✦",
        title: "Command Center",
        description: "View the AI Workforce agent directory and departments.",
      },
    ],
  },
];

function AdminCard({ link }: { link: AdminLink }) {
  return (
    <a
      href={link.href}
      className="group rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm transition hover:border-[#0f766e] hover:shadow-md"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f8fafc] text-xl ring-1 ring-[#e5e7eb] transition group-hover:bg-[#ecfdf5]">
          {link.icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#0f172a]">{link.title}</h3>
          <p className="mt-1 text-xs leading-5 text-[#64748b]">{link.description}</p>
        </div>
      </div>
    </a>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.user) {
          router.push("/login");
          return;
        }

        if (data.user.role !== "admin") {
          router.push("/");
          return;
        }

        setUser(data.user);
        setLoading(false);
      })
      .catch(() => {
        router.push("/login");
      });
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8faf9]">
        <p className="animate-pulse text-sm text-[#64748b]">Loading admin dashboard...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#171717]">
      <header className="border-b border-[#e5e7eb] bg-white px-6 py-5 shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <img src={LOGO_URL} alt="St. Mary's Home" className="h-12 w-auto" />
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#0f766e]">
                St. Mary's AI Workforce
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#0f172a]">
                Admin Dashboard
              </h1>
              <p className="mt-1 text-sm text-[#64748b]">
                Configuration, account management, reporting, logs, and knowledge operations.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#d9e2df] bg-white px-3 py-1.5 text-xs font-medium text-[#64748b]">
              {user?.email}
            </span>
            <a
              href="/"
              className="rounded-full bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59]"
            >
              Back to chat
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 rounded-2xl border border-[#d9e2df] bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-[#0f172a]">Admin-only access</p>
          <p className="mt-1 text-sm leading-6 text-[#64748b]">
            This page uses your signed-in St. Mary's AI Workforce role. No separate admin password is required.
          </p>
        </div>

        <div className="space-y-8">
          {adminSections.map((section) => (
            <section key={section.title}>
              <div className="mb-3">
                <h2 className="text-base font-semibold text-[#0f172a]">{section.title}</h2>
                <p className="mt-0.5 text-sm text-[#64748b]">{section.description}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.links.map((link) => (
                  <AdminCard key={link.href} link={link} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
