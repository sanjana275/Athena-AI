"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles, Zap, Brain } from "lucide-react";

export const GROQ_MODELS = [
  {
    id: "qwen/qwen3.8-27b",
    label: "Qwen 3.8 27B",
    badge: "Default",
    icon: <Sparkles size={14} />,
    desc: "Balanced speed & quality",
  },
  {
    id: "llama-3.3-70b-specdec",
    label: "Llama 3.3 70B Spec",
    badge: "Fast",
    icon: <Zap size={14} />,
    desc: "High speed, great for chat",
  },
  {
    id: "llama-3.1-8b-instant",
    label: "Llama 3.1 8B Instant",
    badge: "Fastest",
    icon: <Zap size={14} />,
    desc: "Ultra-low latency",
  },
  {
    id: "llama-3.2-11b-vision-preview",
    label: "Llama 3.2 11B Vision",
    badge: "Vision",
    icon: <Brain size={14} />,
    desc: "Image understanding",
  },
  {
    id: "mixtral-8x7b-32768",
    label: "Mixtral 8x7B",
    badge: "MoE",
    icon: <Brain size={14} />,
    desc: "Mixture of experts",
  },
  {
    id: "gemma2-9b-it",
    label: "Gemma 2 9B",
    badge: "Google",
    icon: <Sparkles size={14} />,
    desc: "Google's open model",
  },
];

const BADGE_COLOR: Record<string, string> = {
  Default: "bg-accent/15 text-accent",
  Fast: "bg-emerald-500/15 text-emerald-500",
  Fastest: "bg-green-500/15 text-green-500",
  Vision: "bg-purple-500/15 text-purple-500",
  MoE: "bg-orange-500/15 text-orange-500",
  Google: "bg-blue-500/15 text-blue-500",
};

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export function ModelSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const current = GROQ_MODELS.find((m) => m.id === value) ?? GROQ_MODELS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-1.5 text-sm font-medium hover:bg-raised transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-accent">{current.icon}</span>
        <span className="hidden sm:inline max-w-[140px] truncate">{current.label}</span>
        <ChevronDown size={14} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 w-72 rounded-2xl border border-line bg-panel shadow-2xl overflow-hidden" role="listbox">
          <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-muted uppercase tracking-wider">Select Model</p>
          <div className="pb-2">
            {GROQ_MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={value === m.id}
                onClick={() => { onChange(m.id); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-raised transition-colors ${
                  value === m.id ? "bg-accent/10" : ""
                }`}
              >
                <span className={`shrink-0 ${value === m.id ? "text-accent" : "text-muted"}`}>{m.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{m.label}</p>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_COLOR[m.badge] ?? "bg-muted/20 text-muted"}`}>
                      {m.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">{m.desc}</p>
                </div>
                {value === m.id && <span className="shrink-0 w-2 h-2 rounded-full bg-accent" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

