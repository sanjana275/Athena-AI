"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ChatsProvider } from "@/lib/chats";
import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  if (loading || !user) {
    return <div className="flex h-screen items-center justify-center text-sm text-muted">Loading…</div>;
  }

  return (
    <ChatsProvider>
      <div className="flex h-[100dvh] overflow-hidden">
        {open && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}
        <Sidebar open={open} onNavigate={() => setOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-2 border-b border-line px-3 py-2 md:hidden">
            <button className="btn-ghost !px-2" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
            <span className="font-medium">ChatGPT Platform</span>
          </header>
          <main className="min-h-0 flex-1">{children}</main>
        </div>
      </div>
    </ChatsProvider>
  );
}
