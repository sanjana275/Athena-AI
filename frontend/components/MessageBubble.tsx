"use client";
import { useState } from "react";
import { Check, ChevronDown, Copy, FileDown, FileText, Mail, Pencil, Presentation, RefreshCw, Share2, ThumbsDown, ThumbsUp, X } from "lucide-react";
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
  const [shareOpen, setShareOpen] = useState(false);

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
  const isImageMessage =
    m.content.includes("image.pollinations.ai") ||
    m.content.includes("data:image/") ||
    lowerContent.includes("generated image for") ||
    lowerContent.includes("creating your high-resolution image");

  const isDocOrPresentation =
    !isImageMessage &&
    (lowerContent.includes("slide 1") ||
      lowerContent.includes("# presentation") ||
      lowerContent.includes("presentation slides") ||
      (lowerContent.includes("pdf") && (lowerContent.includes("# ") || lowerContent.includes("table of contents"))) ||
      lowerContent.includes("powerpoint deck") ||
      lowerContent.includes("presentation ready"));

  // Show bottom export buttons only when no top card is shown, not an image, and content is substantial
  const showBottomExport = !isDocOrPresentation && !isImageMessage && m.content.length > 180;

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
            {showBottomExport && (
              <>
                <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-raised hover:text-fg transition" title="Export as PDF" onClick={() => exportToPdf("Athena-Document", m.content)}>
                  <FileDown size={14} /> <span>PDF</span>
                </button>
                <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-raised hover:text-fg transition" title="Export as PowerPoint PPT" onClick={() => exportToPpt("Athena-Presentation", m.content)}>
                  <Presentation size={14} /> <span>PPT</span>
                </button>
              </>
            )}
            <button className="rounded p-1.5 hover:text-fg text-muted transition" aria-label="Share conversation" title="Share conversation" onClick={() => setShareOpen(true)}><Share2 size={15} /></button>
            {isLast && <button className="rounded p-1.5 hover:text-fg disabled:opacity-40" aria-label="Regenerate response" title="Regenerate" disabled={busy} onClick={onRegenerate}><RefreshCw size={15} /></button>}
            <button className={clsx("rounded p-1.5 hover:text-fg disabled:opacity-40", m.feedback === 1 && "text-accent")} aria-label="Good response" aria-pressed={m.feedback === 1} disabled={m.id < 0}
              onClick={() => onFeedback(m.id, m.feedback === 1 ? 0 : 1)}><ThumbsUp size={15} /></button>
            <button className={clsx("rounded p-1.5 hover:text-fg disabled:opacity-40", m.feedback === -1 && "text-danger")} aria-label="Bad response" aria-pressed={m.feedback === -1} disabled={m.id < 0}
              onClick={() => onFeedback(m.id, m.feedback === -1 ? 0 : -1)}><ThumbsDown size={15} /></button>
          </div>
        )}
        {shareOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn"
            onClick={() => setShareOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-3xl border border-line bg-panel p-6 shadow-2xl space-y-5 animate-scaleUp"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-accent/15 text-accent">
                    <Share2 size={16} />
                  </div>
                  <h3 className="text-base font-bold text-fg">Share conversation</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="rounded-lg p-1 text-muted hover:text-fg hover:bg-raised transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Link Input & Copy */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted">Conversation Link</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={typeof window !== "undefined" ? window.location.href : ""}
                    className="w-full rounded-xl border border-line bg-panel-2 px-3 py-2 text-xs text-fg select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (typeof window !== "undefined") {
                        await navigator.clipboard.writeText(window.location.href);
                        toast("Link copied to clipboard!");
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition shrink-0"
                  >
                    <Copy size={13} />
                    <span>Copy</span>
                  </button>
                </div>
              </div>

              {/* Quick Share to Apps */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted">Share through</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* WhatsApp */}
                  <button
                    type="button"
                    onClick={() => {
                      const url = typeof window !== "undefined" ? window.location.href : "";
                      const text = `Take a look at this conversation on Athena AI:\n\n${m.content.slice(0, 150)}...\n\n${url}`;
                      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 transition"
                  >
                    <span className="text-base leading-none">💬</span>
                    <span>WhatsApp</span>
                  </button>

                  {/* Email */}
                  <button
                    type="button"
                    onClick={() => {
                      const url = typeof window !== "undefined" ? window.location.href : "";
                      const subject = "Athena AI Conversation";
                      const body = `Hi,\n\nHere is a response from Athena AI:\n\n${m.content.slice(0, 400)}...\n\nRead more at: ${url}`;
                      window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-2.5 text-xs font-semibold text-blue-600 dark:text-blue-400 transition"
                  >
                    <Mail size={15} />
                    <span>Email / Mail</span>
                  </button>

                  {/* Twitter / X */}
                  <button
                    type="button"
                    onClick={() => {
                      const url = typeof window !== "undefined" ? window.location.href : "";
                      const text = `Insights from Athena AI:\n\n${url}`;
                      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-line bg-panel-2 hover:bg-raised px-3 py-2.5 text-xs font-semibold text-fg transition"
                  >
                    <span className="text-sm font-bold">𝕏</span>
                    <span>Twitter / X</span>
                  </button>

                  {/* More Apps */}
                  <button
                    type="button"
                    onClick={async () => {
                      const url = typeof window !== "undefined" ? window.location.href : "";
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            title: "Athena AI Conversation",
                            text: m.content.slice(0, 160),
                            url,
                          });
                        } catch {}
                      } else {
                        await navigator.clipboard.writeText(url);
                        toast("Link copied to clipboard!");
                      }
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 px-3 py-2.5 text-xs font-semibold text-purple-600 dark:text-purple-400 transition"
                  >
                    <Share2 size={15} />
                    <span>More Apps</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end border-t border-line">
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="btn-outline !py-1.5 !px-4 text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
