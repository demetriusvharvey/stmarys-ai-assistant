"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Failed to change password.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f8faf9] px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0f766e] text-2xl shadow">
            🔑
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-[#111827]">Set Your Password</h1>
            <p className="mt-1 text-sm text-[#6b7280]">
              Your account uses a temporary password. Please set a permanent one to continue.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#e5e7eb] bg-white px-6 py-7 shadow-sm"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                Temporary Password
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="Your temporary password"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                New Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                Confirm New Password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat new password"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-3 py-2.5 text-sm text-[#991b1b]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#0f766e] py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving…" : "Set Password & Continue"}
            </button>
          </div>
        </form>

        <p className="mt-5 text-center text-xs text-[#9ca3af]">
          Need help?{" "}
          <a href="mailto:infotechsupport@smhdc.org" className="underline underline-offset-2 hover:text-[#6b7280]">
            Contact IT Support
          </a>
        </p>
      </div>
    </main>
  );
}
