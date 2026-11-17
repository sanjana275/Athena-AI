"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [directLink, setDirectLink] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ message: string; reset_link?: string | null }>("/auth/forgot", {
        method: "POST",
        json: { email },
      });
      setSent(true);
      if (res?.reset_link) {
        setDirectLink(res.reset_link);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-2 text-center text-lg font-semibold">Reset your password</h1>
      {sent ? (
        <div className="space-y-4 text-center text-sm">
          <p className="text-muted">
            If that email has an account, your password reset link is ready.
          </p>
          {directLink ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-left">
              <p className="text-xs font-semibold text-emerald-400 mb-1.5">
                ⚡ Direct Password Reset Link:
              </p>
              <Link
                href={directLink}
                className="btn-primary block text-center text-xs py-2 mt-2"
              >
                Click here to choose new password
              </Link>
            </div>
          ) : (
            <p className="text-xs text-muted">
              Check your inbox or make sure you entered the email you registered with.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-muted">
            Enter your email and we'll generate your password reset link.
          </p>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email"
          />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Generating link…" : "Reset Password"}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm">
        <Link className="text-muted underline hover:text-fg" href="/login">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
