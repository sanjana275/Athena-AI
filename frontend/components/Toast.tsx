"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

type T = { id: number; text: string; kind: "ok" | "error" };
const Ctx = createContext<(text: string, kind?: "ok" | "error") => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-center gap-2 rounded-lg border border-line bg-raised px-4 py-2.5 text-sm shadow-lg">
            {t.kind === "ok" ? <CheckCircle2 size={16} className="text-accent" /> : <XCircle size={16} className="text-danger" />}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
