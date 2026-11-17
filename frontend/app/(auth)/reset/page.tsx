"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { PasswordInput } from "@/components/AuthForm";

function ResetForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await api("/auth/reset", { method: "POST", json: { token, password } }); setDone(true); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  if (!token) return <p className="text-center text-sm text-muted">This reset link is incomplete. <Link className="underline" href="/forgot">Request a new one.</Link></p>;
  return done ? (
    <div className="text-center text-sm">
      <p className="mb-4 text-muted">Password updated. You've been signed out everywhere.</p>
      <Link className="btn-primary" href="/login">Sign in</Link>
    </div>
  ) : (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor="password">New password</label>
        <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
        <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <>
      <h1 className="mb-4 text-center text-lg font-semibold">Choose a new password</h1>
      <Suspense><ResetForm /></Suspense>
    </>
  );
}
