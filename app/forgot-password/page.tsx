"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    setLoading(false);
    setSubmitted(true);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f8faf9] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0f766e] text-2xl shadow">🔑</div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-[#111827]">Forgot Password</h1>
            <p className="mt-1 text-sm text-[#6b7280]">We'll send a reset link to your work email.</p>
          </div>
        </div>

        {submitted ? (
          <div className="rounded-2xl border border-[#a7f3d0] bg-[#f0fdf4] p-6 text-center shadow-sm">
            <p className="text-sm font-medium text-[#065f46]">
              If an account exists for <strong>{email}</strong>, a reset link has been sent.
            </p>
            <p className="mt-2 text-xs text-[#6b7280]">Check your inbox. Link expires in 1 hour.</p>
            <a href="/login" className="mt-4 inline-block text-sm text-[#0f766e] hover:underline">
              Back to sign in
            </a>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-[#e5e7eb] bg-white px-6 py-7 shadow-sm"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#374151]">Work Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@smhdc.org"
                  className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#0f766e] py-2.5 text-sm font-semibold text-white transition hover:bg-[#115e59] disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send Reset Link"}
              </button>
            </div>
          </form>
        )}

        <p className="mt-5 text-center text-xs text-[#9ca3af]">
          <a href="/login" className="underline underline-offset-2 hover:text-[#6b7280]">Back to sign in</a>
        </p>
      </div>
    </main>
  );
}
