"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mic, Image as ImageIcon, Volume2 } from "lucide-react";
import type { VoiceMode } from "@/hooks/useSpeech";

const MODES: { key: VoiceMode; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    key: "voice-to-text",
    label: "Voice → Text",
    icon: <Mic size={15} />,
    desc: "Speak your question, get a text answer",
  },
  {
    key: "text-to-voice",
    label: "Text → Voice",
    icon: <Volume2 size={15} />,
    desc: "Speak your question, AI reads answer aloud",
  },
  {
    key: "voice-to-image",
    label: "Voice → Image",
    icon: <ImageIcon size={15} />,
    desc: "Speak what to generate, get an image",
  },
];

interface Props {
  mode: VoiceMode;
  onChange: (m: VoiceMode) => void;
}

export function VoiceModeMenu({ mode, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const current = MODES.find((m) => m.key === mode) ?? MODES[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg border border-line bg-raised px-2 py-1 text-xs text-muted hover:text-fg hover:border-accent/50 transition-colors"
        title="Switch voice mode"
      >
        {current.icon}
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-50 w-56 rounded-xl border border-line bg-panel shadow-xl overflow-hidden">
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted uppercase tracking-wider">Voice Mode</p>
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => { onChange(m.key); setOpen(false); }}
              className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-raised transition-colors ${
                mode === m.key ? "bg-accent/10 text-accent" : "text-fg"
              }`}
            >
              <span className="mt-0.5 shrink-0">{m.icon}</span>
              <div>
                <p className="text-sm font-medium leading-tight">{m.label}</p>
                <p className="text-[11px] text-muted leading-tight mt-0.5">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

