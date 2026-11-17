"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api, API } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

export function GoogleButton() {
  return (
    <a
      href="/api/auth/google/login"
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-sm font-medium text-fg shadow-sm transition hover:bg-panel-2 hover:border-fg/20"
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
        <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.100 0 24s.9 7.600 2.600 10.800l7.900-6.100z" />
        <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.400-5.700c-2.100 1.400-4.800 2.300-8.500 2.300-6.300 0-11.600-4-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z" />
      </svg>
      Continue with Google
    </a>
  );
}

export function Divider() {
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function PasswordInput({ value, onChange, autoComplete, id = "password" }: { value: string; onChange: (v: string) => void; autoComplete: string; id?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} className="input pr-10" type={show ? "text" : "password"} value={value} required minLength={8} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const register = mode === "register";
  const googleFailed = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("error") === "google";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = await api<User>(register ? "/auth/register" : "/auth/login", {
        method: "POST",
        json: register ? { name, email, password } : { email, password },
      });
      setUser(u);
      router.replace("/chat");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 text-center text-xl font-bold tracking-tight text-fg">
        {register ? "Create your account" : "Welcome back"}
      </h1>
      <GoogleButton />
      {googleFailed && (
        <p className="mt-3 rounded-lg bg-danger/10 p-2.5 text-center text-xs text-danger border border-danger/20">
          Google sign-in failed. Try again or sign in with your email.
        </p>
      )}
      <Divider />
      <form onSubmit={submit} className="space-y-4">
        {register && (
          <div>
            <label className="label text-xs font-medium" htmlFor="name">
              Full Name
            </label>
            <input
              id="name"
              className="input rounded-xl py-2.5 px-3.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoComplete="name"
              placeholder="e.g. Sanjana"
            />
          </div>
        )}
        <div>
          <label className="label text-xs font-medium" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            className="input rounded-xl py-2.5 px-3.5"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="name@example.com"
          />
        </div>
        <div>
          <label className="label text-xs font-medium" htmlFor="password">
            Password
          </label>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete={register ? "new-password" : "current-password"}
          />
          {register && <p className="mt-1 text-xs text-muted">Must be at least 8 characters.</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 p-2.5 text-xs text-danger border border-danger/20">
            {error}
          </p>
        )}
        <button
          className="btn-primary w-full rounded-xl py-3 text-sm font-semibold shadow-md transition hover:shadow-lg"
          disabled={busy}
        >
          {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
        </button>
      </form>
      <div className="mt-6 space-y-2 text-center text-xs text-muted">
        {!register && (
          <p>
            <Link className="text-muted hover:text-fg hover:underline transition" href="/forgot">
              Forgot your password?
            </Link>
          </p>
        )}
        <p>
          {register ? "Already have an account? " : "Don't have an account? "}
          <Link
            className="font-semibold text-accent hover:underline"
            href={register ? "/login" : "/register"}
          >
            {register ? "Sign in" : "Sign up"}
          </Link>
        </p>
      </div>
    </>
  );
}
