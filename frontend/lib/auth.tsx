"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { Settings, User } from "./types";

type Ctx = {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
  updateProfile: (patch: Record<string, any>) => Promise<void>;
};

const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch((e) => { if (!(e instanceof ApiError) || e.status !== 401) console.error(e); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = user?.settings.theme ?? "dark";
  }, [user?.settings.theme]);

  const logout = useCallback(async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (patch: Record<string, any>) => {
    setUser(await api<User>("/profile", { method: "PATCH", json: patch }));
  }, []);

  return <AuthCtx.Provider value={{ user, loading, setUser, logout, updateProfile }}>{children}</AuthCtx.Provider>;
}
