"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Trash2, UploadCloud } from "lucide-react";
import clsx from "clsx";
import { api, uploadFile } from "@/lib/api";
import type { DocumentItem } from "@/lib/types";
import { useToast } from "@/components/Toast";

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentItem[] | null>(null);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const load = useCallback(() => api<DocumentItem[]>("/documents").then(setDocs).catch((e) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); }, [load]);

  async function upload(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      try {
        setProgress({ name: f.name, pct: 0 });
        await uploadFile("/documents", f, (pct) => setProgress({ name: f.name, pct }));
        toast(`${f.name} indexed`);
      } catch (e) { toast((e as Error).message, "error"); }
    }
    setProgress(null);
    load();
  }

  async function remove(d: DocumentItem) {
    if (!confirm(`Delete "${d.filename}"?`)) return;
    try { await api(`/documents/${d.id}`, { method: "DELETE" }); toast("Document deleted"); load(); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold">My documents</h1>
        <p className="mt-1 text-sm text-muted">Only you can see these. Turn on "Answer from my documents" in a chat to ask questions about them.</p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          onClick={() => input.current?.click()}
          role="button" tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
          className={clsx("mt-6 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors", drag ? "border-accent bg-accent/10" : "border-line hover:bg-panel")}
        >
          <UploadCloud size={32} className="text-accent" />
          <p className="mt-3 font-medium">Drop files here or click to choose</p>
          <p className="mt-1 text-sm text-muted">PDF, DOCX, TXT, CSV or JSON · up to 20 MB each</p>
          <input ref={input} type="file" hidden multiple accept=".pdf,.docx,.txt,.csv,.json" onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>

        {progress && (
          <div className="mt-4 rounded-xl border border-line bg-panel p-4">
            <div className="mb-2 flex justify-between text-sm"><span className="truncate">{progress.name}</span><span className="text-muted">{progress.pct < 100 ? `Uploading ${progress.pct}%` : "Reading and indexing…"}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full bg-accent transition-all" style={{ width: `${progress.pct}%` }} /></div>
          </div>
        )}

        <div className="mt-6">
          {docs === null ? (
            <div className="h-16 animate-pulse rounded-xl bg-raised" />
          ) : docs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No documents yet. Upload one to ask questions about it.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText size={18} className="shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.filename}</p>
                    <p className="text-xs text-muted">{d.pages} {d.pages === 1 ? "part" : "parts"} · {d.chunk_count} chunks · {new Date(d.created_at).toLocaleDateString()}</p>
                  </div>
                  <button className="btn-ghost !px-2 text-muted hover:text-danger" aria-label={`Delete ${d.filename}`} onClick={() => remove(d)}><Trash2 size={16} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
