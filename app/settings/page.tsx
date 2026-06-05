"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const LOGO_URL =
  "https://saintmaryshome.org/wp-content/uploads/2025/05/SMH-Logo-2025_LinearStackedTagline-Color.svg";

type User = { id: string; email: string; name: string; role: string };

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setUser(d.user));
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (next !== confirm) { setStatus({ ok: false, msg: "New passwords do not match." }); return; }
    if (next.length < 8) { setStatus({ ok: false, msg: "New password must be at least 8 characters." }); return; }

    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setStatus({ ok: true, msg: "Password updated successfully." });
      setCurrent(""); setNext(""); setConfirm("");
    } else {
      setStatus({ ok: false, msg: data.error ?? "Failed to update password." });
    }
  }

  const roleLabel = user?.role === "admin" ? "Administrator" : user?.role === "it_staff" ? "IT Staff" : "Staff";

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#171717]">
      <div className="mx-auto max-w-2xl px-4 py-10">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <img src={LOGO_URL} alt="St. Mary's Home" className="h-10 w-auto" />
          <a href="/" className="text-sm text-[#0f766e] hover:underline">← Back to Chat</a>
        </div>

        <h1 className="mb-6 text-2xl font-semibold">Account Settings</h1>

        {/* Profile card */}
        {user && (
          <section className="mb-6 rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Your Account</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-[#94a3b8]">Name</p>
                <p className="text-sm font-medium text-[#0f172a]">{user.name}</p>
              </div>
              <div>
                <p className="text-xs text-[#94a3b8]">Email</p>
                <p className="text-sm font-medium text-[#0f172a]">{user.email}</p>
              </div>
              <div>
                <p className="text-xs text-[#94a3b8]">Role</p>
                <span className="inline-block rounded-full bg-[#e6f4f1] px-2.5 py-0.5 text-xs font-semibold text-[#0f766e]">
                  {roleLabel}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Change password */}
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Change Password</p>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">Current Password</label>
              <input
                type="password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">New Password</label>
              <input
                type="password"
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">Confirm New Password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
              />
            </div>

            {status && (
              <div className={`rounded-lg border px-3 py-2.5 text-sm ${
                status.ok
                  ? "border-[#a7f3d0] bg-[#f0fdf4] text-[#065f46]"
                  : "border-[#fca5a5] bg-[#fef2f2] text-[#991b1b]"
              }`}>
                {status.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#0f766e] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#115e59] disabled:opacity-60"
            >
              {loading ? "Saving…" : "Update Password"}
            </button>
          </form>
        </section>

        {/* Sign out */}
        <div className="mt-6 text-center">
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
            }}
            className="text-sm text-[#94a3b8] hover:text-[#64748b] hover:underline"
          >
            Sign out
          </button>
        </div>

      </div>
    </main>
  );
}
