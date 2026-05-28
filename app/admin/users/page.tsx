"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  email: string;
  display_name: string;
  role: "staff" | "it_staff" | "admin";
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  staff: "Staff",
  it_staff: "IT Staff",
  admin: "Admin",
};

const ROLE_STYLES: Record<string, string> = {
  staff: "bg-[#f1f5f9] text-[#475569]",
  it_staff: "bg-[#eff6ff] text-[#1d4ed8]",
  admin: "bg-[#faf5ff] text-[#6b21a8]",
};

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ id: string; role: string } | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: "", display_name: "", role: "staff", password: "" });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Reset password
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d || d.user?.role !== "admin") { router.push("/"); return; }
        setSession(d.user);
      });
  }, [router]);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoadingUsers(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users || []);
    setLoadingUsers(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setFormLoading(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setFormLoading(false);
    if (!res.ok) { setFormError(data.error || "Failed to create user"); return; }
    setForm({ email: "", display_name: "", role: "staff", password: "" });
    setShowCreate(false);
    fetchUsers();
  }

  async function toggleActive(user: User) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !user.is_active }),
    });
    fetchUsers();
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError("");
    setResetLoading(true);
    const res = await fetch(`/api/admin/users/${resetTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: resetPassword }),
    });
    const data = await res.json();
    setResetLoading(false);
    if (!res.ok) { setResetError(data.error || "Failed to reset password"); return; }
    setResetTarget(null);
    setResetPassword("");
  }

  if (!session) return null;

  return (
    <main className="min-h-screen bg-[#f8faf9] px-4 py-10">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[#111827]">User Management</h1>
            <p className="mt-0.5 text-sm text-[#6b7280]">
              Create and manage staff accounts. All actions are logged.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb]"
            >
              ← Back to Chat
            </button>
            <button
              onClick={() => { setShowCreate(true); setFormError(""); }}
              className="rounded-lg bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#115e59]"
            >
              + New Account
            </button>
          </div>
        </div>

        {/* Create user modal */}
        {showCreate && (
          <div className="mb-6 rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-[#111827]">Create New Account</h2>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[#374151]">Full Name</label>
                <input
                  required
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  placeholder="Jane Smith"
                  className="w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#374151]">Email</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jsmith@smhdc.org"
                  className="w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#374151]">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
                >
                  <option value="staff">Staff</option>
                  <option value="it_staff">IT Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#374151]">
                  Temporary Password
                </label>
                <input
                  required
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min. 8 characters"
                  className="w-full rounded-lg border border-[#d1d5db] px-3 py-2 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
                />
              </div>

              {formError && (
                <div className="col-span-2 rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">
                  {formError}
                </div>
              )}

              <div className="col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-[#d1d5db] bg-white px-4 py-2 text-sm text-[#374151] hover:bg-[#f9fafb]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="rounded-lg bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#115e59] disabled:opacity-60"
                >
                  {formLoading ? "Creating…" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Reset password modal */}
        {resetTarget && (
          <div className="mb-6 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-[#92400e]">
              Reset Password — {resetTarget.display_name}
            </h2>
            <p className="mb-4 text-sm text-[#b45309]">
              Set a new temporary password. Tell the staff member to sign in and remember it.
            </p>
            <form onSubmit={handleReset} className="flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-[#374151]">New Password</label>
                <input
                  required
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-sm focus:border-[#0f766e] focus:outline-none"
                />
              </div>
              {resetError && <p className="text-sm text-[#991b1b]">{resetError}</p>}
              <button
                type="submit"
                disabled={resetLoading}
                className="rounded-lg bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#115e59] disabled:opacity-60"
              >
                {resetLoading ? "Saving…" : "Save Password"}
              </button>
              <button
                type="button"
                onClick={() => { setResetTarget(null); setResetPassword(""); setResetError(""); }}
                className="rounded-lg border border-[#d1d5db] bg-white px-4 py-2 text-sm text-[#374151] hover:bg-[#f9fafb]"
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        {/* Users table */}
        <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
          {loadingUsers ? (
            <div className="px-6 py-10 text-center text-sm text-[#9ca3af]">Loading accounts…</div>
          ) : users.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-[#9ca3af]">No accounts yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#f1f5f9] bg-[#f8faf9]">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Name</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Email</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Role</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Last Login</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Status</th>
                  <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {users.map((user) => (
                  <tr key={user.id} className={user.is_active ? "" : "opacity-50"}>
                    <td className="px-5 py-3.5 font-medium text-[#111827]">{user.display_name}</td>
                    <td className="px-5 py-3.5 text-[#6b7280]">{user.email}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_STYLES[user.role]}`}>
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[#6b7280]">{formatDate(user.last_login_at)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-[12px] font-medium ${user.is_active ? "text-[#16a34a]" : "text-[#9ca3af]"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${user.is_active ? "bg-[#16a34a]" : "bg-[#d1d5db]"}`} />
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setResetTarget(user); setResetPassword(""); setResetError(""); }}
                          className="rounded-md border border-[#e5e7eb] px-2.5 py-1 text-xs text-[#374151] hover:bg-[#f9fafb]"
                        >
                          Reset password
                        </button>
                        <button
                          onClick={() => toggleActive(user)}
                          disabled={session?.id === user.id}
                          className={`rounded-md border px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                            user.is_active
                              ? "border-[#fca5a5] text-[#991b1b] hover:bg-[#fef2f2]"
                              : "border-[#bbf7d0] text-[#166534] hover:bg-[#f0fdf4]"
                          }`}
                        >
                          {user.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-[#c4c9d4]">
          Admin panel — St. Mary&apos;s AI Workforce. All account changes are logged.
        </p>
      </div>
    </main>
  );
}
