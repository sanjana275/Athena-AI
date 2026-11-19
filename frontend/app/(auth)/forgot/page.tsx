"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { PasswordInput } from "@/components/AuthForm";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setBusy(true);
    try {
      await api("/auth/reset-direct", {
        method: "POST",
        json: { email: email.trim().toLowerCase(), new_password: password },
      });
      setDone(true);
    } catch (err) {
      setError((err as Error).message || "Could not update password. Please check your email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-center text-xl font-bold tracking-tight">Reset your password</h1>
      <p className="mb-5 text-center text-xs text-muted">
        Choose a new password for your Athena AI account.
      </p>

      {done ? (
        <div className="space-y-4 text-center animate-fadeIn py-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
            <CheckCircle2 size={26} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-fg">Password updated successfully!</h2>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Your password for <strong className="text-fg">{email}</strong> has been reset. You can now sign in with your new credentials.
            </p>
          </div>
          <Link
            href="/login"
            className="btn-primary block w-full py-2.5 text-center text-sm font-semibold mt-4"
          >
            Sign in now
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Your registered email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
            />
          </div>

          <div>
            <label className="label" htmlFor="new-password">
              New password
            </label>
            <PasswordInput
              id="new-password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
            <p className="mt-1 text-[11px] text-muted">Minimum 6 characters.</p>
          </div>

          <div>
            <label className="label" htmlFor="confirm-password">
              Confirm new password
            </label>
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-500">
              {error}
            </div>
          )}

          <button className="btn-primary w-full py-2.5 font-semibold text-sm" disabled={busy}>
            {busy ? "Updating password…" : "Reset & Save Password"}
          </button>
        </form>
      )}

      <p className="mt-5 text-center text-xs text-muted">
        <Link className="inline-flex items-center gap-1.5 text-muted hover:text-fg transition underline" href="/login">
          <ArrowLeft size={13} /> Back to sign in
        </Link>
      </p>
    </>
  );
}
