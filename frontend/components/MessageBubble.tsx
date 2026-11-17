"use client";
import { useState } from "react";
import { Check, ChevronDown, Copy, FileDown, FileText, Pencil, Presentation, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { exportToPdf, exportToPpt } from "@/lib/exporter";
import type { Message } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";
import { Markdown } from "./Markdown";
import { useToast } from "./Toast";

function Sources({ sources }: { sources: Message["sources"] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!sources.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs text-muted">Sources</p>
      <div className="flex flex-wrap gap-2">
        {sources.map((s, i) => (
          <button key={i} onClick={() => setOpen(open === i ? null : i)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-xs hover:bg-raised"
            aria-expanded={open === i}>
            <FileText size={12} className="text-accent" />
            [{i + 1}] {s.filename} · {s.location}
            <ChevronDown size={12} className={clsx("transition-transform", open === i && "rotate-180")} />
          </button>
        ))}
      </div>
      {open !== null && (
        <blockquote className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-panel p-3 text-xs text-muted">
          {sources[open].content}
        </blockquote>
      )}
    </div>
  );
}

type Props = {
  message: Message;
  isLast: boolean;
  streaming: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onEdit: (id: number, content: string) => void;
  onFeedback: (id: number, value: number) => void;
};

export function MessageBubble({ message: m, isLast, streaming, busy, onRegenerate, onEdit, onFeedback }: Props) {
  const { user } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(m.content);
    setCopied(true); toast("Copied");
    setTimeout(() => setCopied(false), 1500);
  };

  if (m.role === "user") {
    return (
      <div className="group flex justify-end gap-3">
        <div className="flex max-w-[85%] flex-col items-end">
          {editing ? (
            <div className="w-full min-w-[min(28rem,80vw)] rounded-2xl border border-line bg-raised p-3">
              <textarea autoFocus className="w-full resize-none bg-transparent text-sm outline-none" rows={Math.min(8, draft.split("\n").length + 1)}
                value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="mt-2 flex justify-end gap-2">
                <button className="btn-ghost !py-1" onClick={() => { setEditing(false); setDraft(m.content); }}>Cancel</button>
                <button className="btn-primary !py-1" disabled={!draft.trim() || busy} onClick={() => { setEditing(false); onEdit(m.id, draft.trim()); }}>Save & regenerate</button>
              </div>
            </div>
          ) : (
            <>
              <div className="whitespace-pre-wrap break-words rounded-2xl bg-raised px-4 py-2.5 text-[15px]">{m.content}</div>
              <div className="mt-1 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <button className="rounded p-1.5 text-muted hover:text-fg" aria-label="Copy message" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
                <button className="rounded p-1.5 text-muted hover:text-fg disabled:opacity-40" aria-label="Edit message" disabled={busy || m.id < 0} onClick={() => setEditing(true)}><Pencil size={14} /></button>
              </div>
            </>
          )}
        </div>
        <div className="hidden pt-1 sm:block"><Avatar name={user?.name || "You"} picture={user?.picture} size={28} /></div>
      </div>
    );
  }

  const live = streaming && isLast;
  const lowerContent = m.content.toLowerCase();
  const isDocOrPresentation =
    lowerContent.includes("pdf") ||
    lowerContent.includes("presentation") ||
    lowerContent.includes("slide 1") ||
    lowerContent.includes("powerpoint") ||
    lowerContent.includes("roadmap") ||
    lowerContent.includes("document");

  return (
    <div className="group flex gap-3">
      <div className="pt-0.5"><Logo size={28} /></div>
      <div className="min-w-0 flex-1">
        {m.content || live ? <Markdown streaming={live}>{m.content}</Markdown> : <p className="text-sm text-muted">No response.</p>}
        {!live && isDocOrPresentation && (
          <div className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-3.5 shadow-sm">
            <div className="flex items-center gap-2.5 text-xs font-semibold text-fg">
              <FileDown size={17} className="text-accent" />
              <span>Document & Presentation Exports Ready</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportToPdf("Athena-Document", m.content)}
                className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition"
              >
                <FileDown size={13} />
                <span>Download PDF</span>
              </button>
              <button
                onClick={() => exportToPpt("Athena-Presentation", m.content)}
                className="flex items-center gap-1.5 rounded-xl border border-line bg-panel-2 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-raised transition"
              >
                <Presentation size={13} />
                <span>Download PPT</span>
              </button>
            </div>
          </div>
        )}
        {!live && <Sources sources={m.sources} />}
        {!live && m.content && (
          <div className="mt-2 flex items-center gap-1.5 text-muted">
            <button className="rounded p-1.5 hover:text-fg" aria-label="Copy response" title="Copy" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
            <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-raised hover:text-fg transition" title="Export as PDF" onClick={() => exportToPdf("Athena-Document", m.content)}>
              <FileDown size={14} /> <span>PDF</span>
            </button>
            <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-raised hover:text-fg transition" title="Export as PowerPoint PPT" onClick={() => exportToPpt("Athena-Presentation", m.content)}>
              <Presentation size={14} /> <span>PPT</span>
            </button>
            {isLast && <button className="rounded p-1.5 hover:text-fg disabled:opacity-40" aria-label="Regenerate response" title="Regenerate" disabled={busy} onClick={onRegenerate}><RefreshCw size={15} /></button>}
            <button className={clsx("rounded p-1.5 hover:text-fg disabled:opacity-40", m.feedback === 1 && "text-accent")} aria-label="Good response" aria-pressed={m.feedback === 1} disabled={m.id < 0}
              onClick={() => onFeedback(m.id, m.feedback === 1 ? 0 : 1)}><ThumbsUp size={15} /></button>
            <button className={clsx("rounded p-1.5 hover:text-fg disabled:opacity-40", m.feedback === -1 && "text-danger")} aria-label="Bad response" aria-pressed={m.feedback === -1} disabled={m.id < 0}
              onClick={() => onFeedback(m.id, m.feedback === -1 ? 0 : -1)}><ThumbsDown size={15} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
