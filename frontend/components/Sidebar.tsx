"use client";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Archive, FileText, LogOut, MessageSquare, Pencil, Pin, PinOff, Plus, Search, Settings, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useChats } from "@/lib/chats";
import type { ChatSummary } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";
import { useToast } from "./Toast";

function groupOf(c: ChatSummary) {
  const d = new Date(c.updated_at);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = (startToday.getTime() - d.getTime()) / 86400000;
  if (d >= startToday) return "Today";
  if (days <= 1) return "Yesterday";
  if (days <= 7) return "Previous 7 days";
  return "Older";
}
const ORDER = ["Today", "Yesterday", "Previous 7 days", "Older"];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { user, logout } = useAuth();
  const { chats, query, setQuery, refresh } = useChats();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const toast = useToast();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") { e.preventDefault(); router.push("/chat"); onNavigate(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, onNavigate]);

  async function saveRename(id: string) {
    const t = title.trim();
    setRenaming(null);
    if (!t) return;
    try { await api(`/chats/${id}`, { method: "PATCH", json: { title: t } }); await refresh(); toast("Chat renamed"); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  async function togglePin(c: ChatSummary) {
    const isPinned = !!c.pinned;
    try {
      if (isPinned) {
        await api(`/chats/${c.id}/unpin`, { method: "POST" });
        toast("Chat unpinned");
      } else {
        await api(`/chats/${c.id}/pin`, { method: "POST" });
        toast("Chat pinned to top");
      }
      await refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function archive(c: ChatSummary) {
    try {
      await api(`/chats/${c.id}/archive`, { method: "POST" });
      await refresh();
      toast("Chat moved to archived chats");
      if (params.id === c.id) router.push("/chat");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function remove(c: ChatSummary) {
    if (!confirm(`Delete "${c.title}"? This can't be undone.`)) return;
    try {
      await api(`/chats/${c.id}`, { method: "DELETE" });
      await refresh();
      toast("Chat deleted");
      if (params.id === c.id) router.push("/chat");
    } catch (e) { toast((e as Error).message, "error"); }
  }

  const pinnedChats = chats.filter((c) => c.pinned);
  const regularChats = chats.filter((c) => !c.pinned);
  const groups = ORDER.map((g) => [g, regularChats.filter((c) => groupOf(c) === g)] as const).filter(([, l]) => l.length);

  return (
    <aside className={clsx(
      "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-panel transition-transform md:static md:translate-x-0",
      open ? "translate-x-0" : "-translate-x-full"
    )}>
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <Logo size={30} />
        <div className="flex flex-col min-w-0">
          <span className="font-bold tracking-tight text-sm leading-tight text-fg">Athena AI</span>
          <span className="text-[10px] text-muted leading-tight truncate">Intelligence. Beyond Boundaries.</span>
        </div>
      </div>
      <div className="space-y-2 p-3">
        <Link href="/chat" onClick={onNavigate} className="btn-outline w-full justify-start"><Plus size={16} /> New chat <kbd className="ml-auto text-xs text-muted">Ctrl+Shift+O</kbd></Link>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input ref={searchRef} className="input pl-9" placeholder="Search chats (Ctrl+K)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search chats" />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Chats">
        {chats.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted">{query ? "No chats match your search." : "No chats yet. Ask something to get started."}</p>
        )}

        {/* Pinned Chats Section */}
        {pinnedChats.length > 0 && (
          <div className="mb-3">
            <p className="px-3 py-1 text-xs font-semibold text-accent flex items-center gap-1.5">
              <Pin size={12} className="rotate-45 fill-accent" />
              <span>Pinned</span>
            </p>
            {pinnedChats.map((c) => (
              <div key={c.id} className={clsx("group flex items-center rounded-lg pr-1", params.id === c.id ? "bg-raised" : "hover:bg-raised/60")}>
                {renaming === c.id ? (
                  <input autoFocus className="input m-1 !py-1" value={title} onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => saveRename(c.id)} onKeyDown={(e) => { if (e.key === "Enter") saveRename(c.id); if (e.key === "Escape") setRenaming(null); }} />
                ) : (
                  <>
                    <Link href={`/chat/${c.id}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm">
                      <Pin size={13} className="shrink-0 text-accent rotate-45 fill-accent/30" />
                      <span className="truncate font-medium">{c.title}</span>
                    </Link>
                    <button className="hidden rounded p-1.5 text-accent hover:text-fg group-hover:block focus:block" aria-label="Unpin chat" title="Unpin chat" onClick={() => togglePin(c)}>
                      <PinOff size={14} />
                    </button>
                    <button className="hidden rounded p-1.5 text-muted hover:text-fg group-hover:block focus:block" aria-label={`Archive ${c.title}`} title="Archive chat" onClick={() => archive(c)}><Archive size={14} /></button>
                    <button className="hidden rounded p-1.5 text-muted hover:text-fg group-hover:block focus:block" aria-label={`Rename ${c.title}`} title="Rename chat" onClick={() => { setRenaming(c.id); setTitle(c.title); }}><Pencil size={14} /></button>
                    <button className="hidden rounded p-1.5 text-muted hover:text-danger group-hover:block focus:block" aria-label={`Delete ${c.title}`} title="Delete chat" onClick={() => remove(c)}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Regular Ordered Groups */}
        {groups.map(([g, list]) => (
          <div key={g} className="mb-3">
            <p className="px-3 py-1 text-xs font-medium text-muted">{g}</p>
            {list.map((c) => (
              <div key={c.id} className={clsx("group flex items-center rounded-lg pr-1", params.id === c.id ? "bg-raised" : "hover:bg-raised/60")}>
                {renaming === c.id ? (
                  <input autoFocus className="input m-1 !py-1" value={title} onChange={(e) => setTitle(e.target.value)}
                    onBlur={() => saveRename(c.id)} onKeyDown={(e) => { if (e.key === "Enter") saveRename(c.id); if (e.key === "Escape") setRenaming(null); }} />
                ) : (
                  <>
                    <Link href={`/chat/${c.id}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm">
                      <MessageSquare size={14} className="shrink-0 text-muted" /><span className="truncate">{c.title}</span>
                    </Link>
                    <button className="hidden rounded p-1.5 text-muted hover:text-accent group-hover:block focus:block" aria-label="Pin chat" title="Pin chat to top" onClick={() => togglePin(c)}>
                      <Pin size={14} className="rotate-45" />
                    </button>
                    <button className="hidden rounded p-1.5 text-muted hover:text-fg group-hover:block focus:block" aria-label={`Archive ${c.title}`} title="Archive chat" onClick={() => archive(c)}><Archive size={14} /></button>
                    <button className="hidden rounded p-1.5 text-muted hover:text-fg group-hover:block focus:block" aria-label={`Rename ${c.title}`} title="Rename chat" onClick={() => { setRenaming(c.id); setTitle(c.title); }}><Pencil size={14} /></button>
                    <button className="hidden rounded p-1.5 text-muted hover:text-danger group-hover:block focus:block" aria-label={`Delete ${c.title}`} title="Delete chat" onClick={() => remove(c)}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-2">
        <Link href="/documents" onClick={onNavigate} className={clsx("btn-ghost w-full justify-start", pathname === "/documents" && "bg-raised")}><FileText size={16} /> My documents</Link>
        <Link href="/settings" onClick={onNavigate} className={clsx("btn-ghost w-full justify-start", pathname === "/settings" && "bg-raised")}><Settings size={16} /> Settings</Link>
        <div className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2">
          <Avatar name={user!.name} picture={user!.picture} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user!.name}</p>
            <p className="truncate text-xs text-muted">{user!.email}</p>
          </div>
          <button className="btn-ghost !px-2" aria-label="Sign out" title="Sign out" onClick={async () => { await logout(); router.replace("/login"); }}><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
  );
}
