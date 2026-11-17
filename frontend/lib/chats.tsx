"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { ChatSummary } from "./types";

type Ctx = {
  chats: ChatSummary[];
  query: string;
  setQuery: (q: string) => void;
  refresh: () => Promise<void>;
};
const ChatsCtx = createContext<Ctx>(null as unknown as Ctx);
export const useChats = () => useContext(ChatsCtx);

export function ChatsProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [query, setQuery] = useState("");
  const q = useRef("");
  q.current = query;

  const refresh = useCallback(async () => {
    try {
      const path = q.current.trim() ? `/chats?q=${encodeURIComponent(q.current.trim())}` : "/chats";
      setChats(await api<ChatSummary[]>(path));
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(refresh, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [query, refresh]);

  return <ChatsCtx.Provider value={{ chats, query, setQuery, refresh }}>{children}</ChatsCtx.Provider>;
}
