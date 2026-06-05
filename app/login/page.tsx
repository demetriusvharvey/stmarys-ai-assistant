"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Strip any credentials from the URL immediately — they should never appear there
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("email") || url.searchParams.has("password")) {
      url.searchParams.delete("email");
      url.searchParams.delete("password");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Incorrect email or password. Contact IT if you need access.");
      return;
    }

    const data = await res.json();
    if (data.mustChangePassword) {
      window.location.href = "/change-password";
    } else {
      window.location.href = "/";
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#f8faf9] px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0f766e] text-2xl shadow">
            🏥
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-[#111827]">
              St. Mary&apos;s AI Workforce
            </h1>
            <p className="mt-1 text-sm text-[#6b7280]">
              Sign in with your staff account
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-[#e5e7eb] bg-white px-6 py-7 shadow-sm"
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-[#374151]"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@smhdc.org"
                className="w-full rounded-lg border border-[#d1d5db] px-3 py-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:border-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e]/20"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-[#374151]"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>

        <div className="mt-5 flex flex-col items-center gap-1.5 text-center text-xs text-[#9ca3af]">
          <a href="/forgot-password" className="underline underline-offset-2 hover:text-[#6b7280]">
            Forgot your password?
          </a>
          <span>
            No account?{" "}
            <a href="mailto:infotechsupport@smhdc.org" className="underline underline-offset-2 hover:text-[#6b7280]">
              Contact IT Support
            </a>
          </span>
        </div>

        <p className="mt-6 text-center text-[11px] text-[#c4c9d4]">
          For authorized St. Mary&apos;s staff only. All activity is logged.
        </p>

      </div>
    </main>
  );
}
