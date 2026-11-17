"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => { if (user) router.replace("/chat"); }, [user, router]);
  if (loading || user) return null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-bg to-panel/50 px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center justify-center gap-2">
          <div className="rounded-2xl border border-accent/20 bg-accent/10 p-2 shadow-sm">
            <Logo size={42} />
          </div>
          <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-fg to-fg/75 bg-clip-text">Athena AI</span>
          <span className="text-xs text-muted">Intelligent AI Assistant & Workspace</span>
        </div>
        <div className="rounded-3xl border border-line/80 bg-panel/90 p-8 shadow-2xl backdrop-blur-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
