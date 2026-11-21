"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (user) router.replace("/chat");
  }, [user, router]);

  useEffect(() => {
    const saved = localStorage.getItem("athena_login_theme");
    const current = (saved as "dark" | "light") || (document.documentElement.dataset.theme as "dark" | "light") || "dark";
    setTheme(current);
    document.documentElement.dataset.theme = current;
    setMounted(true);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("athena_login_theme", next);
  }

  if (loading || user) return null;

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-b from-bg to-panel/50 px-4 py-12 transition-colors duration-300">
      {/* Top right theme toggle button - specific to login / auth page */}
      <div className="fixed top-5 right-5 z-50">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-panel/90 text-fg shadow-md backdrop-blur-md transition-all duration-200 hover:bg-raised hover:scale-105 active:scale-95"
        >
          {mounted && theme === "light" ? (
            <Moon size={16} className="text-indigo-600 transition-transform duration-200" />
          ) : (
            <Sun size={16} className="text-amber-400 transition-transform duration-200" />
          )}
        </button>
      </div>

      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center justify-center text-center">
          <div className="relative mb-3 group">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-500/25 via-purple-500/25 to-indigo-500/25 blur-md opacity-80" />
            <div className="relative rounded-2xl border border-amber-500/30 bg-[#0d091a] p-1 shadow-2xl">
              <Logo size={58} />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-fg">
            Athena AI
          </h1>
          <p className="mt-1 text-xs font-semibold text-accent tracking-wide">
            Intelligence. Beyond Boundaries.
          </p>
          <p className="text-[11px] text-muted tracking-wider mt-0.5">
            Think · Discover · Create
          </p>
        </div>
        <div className="rounded-3xl border border-line/80 bg-panel/90 p-8 shadow-2xl backdrop-blur-sm transition-colors duration-300">
          {children}
        </div>
      </div>
    </main>
  );
}
