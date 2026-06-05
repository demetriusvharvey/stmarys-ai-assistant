"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) { setError("Passwords do not match."); return; }
    if (next.length < 8) { setError("Password must be at least 8 characters."); return; }

    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: next }),
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      router.push("/login?reset=1");
    } else {
      setError(data.error ?? "Reset failed. The link may have expired.");
    }
  }

  if (!token) {
    return (
      <div className="rounded-2xl border border-[#fca5a5] bg-[#fef2f2] p-6 text-center">
        <p className="text-sm text-[#991b1b]">Invalid reset link. Please request a new one.</p>
        <a href="/forgot-password" className="mt-3 inline-block text-sm text-[#0f766e] hover:underline">Request new link</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[#e5e7eb] bg-white px-6 py-7 shadow-sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#374151]">New Password</label>
          <input type="password" required value={next} onChange={(e) => setNext(e.target.value)}
            placeholder="Min. 8 characters"
            className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[#374151]">Confirm New Password</label>
          <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20" />
        </div>
        {error && (
          <div className="rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-3 py-2.5 text-sm text-[#991b1b]">{error}</div>
        )}
        <button type="submit" disabled={loading}
          className="w-full rounded-lg bg-[#0f766e] py-2.5 text-sm font-semibold text-white transition hover:bg-[#115e59] disabled:opacity-60">
          {loading ? "Saving…" : "Set New Password"}
        </button>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f8faf9] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0f766e] text-2xl shadow">🔑</div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-[#111827]">Set New Password</h1>
            <p className="mt-1 text-sm text-[#6b7280]">Choose a strong password for your account.</p>
          </div>
        </div>
        <Suspense fallback={<div className="text-sm text-[#6b7280]">Loading…</div>}>
          <ResetForm />
        </Suspense>
        <p className="mt-5 text-center text-xs text-[#9ca3af]">
          <a href="/login" className="underline underline-offset-2 hover:text-[#6b7280]">Back to sign in</a>
        </p>
      </div>
    </main>
  );
}
