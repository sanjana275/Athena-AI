"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Paperclip, Square, X, Mic, MicOff } from "lucide-react";
import { uploadFile } from "@/lib/api";
import type { DocumentItem } from "@/lib/types";
import { useToast } from "./Toast";
import { VoiceModeMenu } from "./VoiceModeMenu";
import { useSpeech, speak, stopSpeaking, type VoiceMode } from "@/hooks/useSpeech";

type Props = {
  streaming: boolean;
  docCount: number;
  useDocs: boolean;
  onUseDocs: (v: boolean) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onUploaded: () => void;
  /** Called with the last AI reply so Composer can speak it in text-to-voice mode */
  lastAiReply?: string;
};

export function Composer({ streaming, docCount, useDocs, onUseDocs, onSend, onStop, onUploaded, lastAiReply }: Props) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);
  const [attachedImage, setAttachedImage] = useState<{ name: string; url: string } | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("voice-to-text");
  const [speaking, setSpeaking] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // ── Speech recognition ───────────────────────────────────────────────────
  const { listening, supported, start, stop } = useSpeech({
    onTranscript: (transcript) => {
      if (voiceMode === "voice-to-image") {
        // Prepend create-image phrasing so detect_image_request triggers
        const prompt = `create an image of ${transcript}`;
        setText(prompt);
        toast(`🎙️ "${transcript}" — sending as image request…`);
        setTimeout(() => {
          onSend(prompt);
          setText("");
        }, 600);
      } else {
        // voice-to-text or text-to-voice: put transcript in box and auto-send
        setText(transcript);
        toast(`🎙️ Heard: "${transcript.slice(0, 60)}${transcript.length > 60 ? "…" : ""}"`);
        setTimeout(() => {
          onSend(transcript);
          setText("");
        }, 400);
      }
    },
    onError: (msg) => toast(msg, "error"),
  });

  // ── Auto-speak AI reply in text-to-voice mode ─────────────────────────────
  useEffect(() => {
    if (voiceMode !== "text-to-voice" || !lastAiReply || streaming) return;
    setSpeaking(true);
    speak(lastAiReply);
    // Poll until done (SpeechSynthesis doesn't fire onend reliably)
    const id = setInterval(() => {
      if (!window.speechSynthesis?.speaking) { setSpeaking(false); clearInterval(id); }
    }, 500);
    return () => clearInterval(id);
  }, [lastAiReply, voiceMode, streaming]);

  // Auto-resize textarea
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [text]);

  function submit() {
    let t = text.trim();
    if (attachedImage) {
      t = (t ? t + "\n\n" : "") + `![${attachedImage.name}](${attachedImage.url})`;
      setAttachedImage(null);
    }
    if (!t || streaming) return;
    onSend(t);
    setText("");
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (ev.target?.result) {
              setAttachedImage({ name: file.name || "pasted-image.png", url: ev.target.result as string });
              toast("Image attached from clipboard!");
            }
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      const isImg = f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(f.name);
      if (isImg) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
            setAttachedImage({ name: f.name, url: ev.target.result as string });
            toast(`${f.name} attached to message`);
          }
        };
        reader.readAsDataURL(f);
      }
      try {
        setUploading(0);
        const doc = await uploadFile<DocumentItem>("/documents", f, setUploading);
        toast(`${doc.filename} indexed`);
        onUseDocs(true);
        onUploaded();
      } catch (e) {
        if (!isImg) toast((e as Error).message, "error");
      }
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggleMic() {
    if (!supported) { toast("Speech recognition not supported. Use Chrome or Edge.", "error"); return; }
    if (listening) stop();
    else start();
  }

  function toggleSpeak() {
    if (speaking) { stopSpeaking(); setSpeaking(false); }
    else if (lastAiReply) speak(lastAiReply);
  }

  const micLabel = listening ? "Stop recording" : voiceMode === "voice-to-image" ? "Speak image description" : "Speak your question";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className={`rounded-2xl border p-2 transition-colors ${listening ? "border-red-500/70 bg-red-500/5" : "border-line bg-raised focus-within:border-accent/60"}`}>
        {/* Attached image preview */}
        {attachedImage && (
          <div className="relative inline-flex items-center gap-2 mb-2 p-1.5 pr-3 bg-base border border-line rounded-xl text-xs max-w-xs">
            <img src={attachedImage.url} alt="Attached" className="w-10 h-10 object-cover rounded-lg border border-line" />
            <span className="truncate max-w-[150px] font-medium">{attachedImage.name}</span>
            <button type="button" onClick={() => setAttachedImage(null)} className="ml-auto text-muted hover:text-fg p-0.5 rounded-full hover:bg-raised" title="Remove image">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Listening indicator */}
        {listening && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            Listening… speak now
          </div>
        )}

        <textarea
          ref={ref} rows={1} value={text}
          placeholder={listening ? "Listening…" : "Ask anything, or paste / upload an image…"}
          aria-label="Message"
          className="max-h-[200px] w-full resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-muted"
          onChange={(e) => setText(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
        />

        <div className="flex items-center gap-1.5 px-1 flex-wrap">
          {/* File upload */}
          <input ref={fileRef} type="file" hidden multiple accept=".pdf,.docx,.txt,.csv,.json,.png,.jpg,.jpeg,.webp,.gif" onChange={(e) => upload(e.target.files)} />
          <button className="btn-ghost !px-2" aria-label="Upload documents or images" title="Upload PDF, DOCX, TXT, CSV, JSON or images" onClick={() => fileRef.current?.click()} disabled={uploading !== null}>
            <Paperclip size={18} />
          </button>

          {/* Mic button */}
          {supported && (
            <button
              type="button"
              onClick={toggleMic}
              title={micLabel}
              aria-label={micLabel}
              className={`btn-ghost !px-2 transition-colors ${listening ? "text-red-500 hover:text-red-400" : "text-muted hover:text-fg"}`}
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}

          {/* Voice mode selector — only show when mic is supported */}
          {supported && (
            <VoiceModeMenu mode={voiceMode} onChange={setVoiceMode} />
          )}

          {/* Speaking indicator for text-to-voice mode */}
          {voiceMode === "text-to-voice" && lastAiReply && (
            <button
              type="button"
              onClick={toggleSpeak}
              title={speaking ? "Stop speaking" : "Read last reply aloud"}
              className={`btn-ghost !px-2 text-xs flex items-center gap-1 ${speaking ? "text-accent animate-pulse" : "text-muted"}`}
            >
              🔊 {speaking ? "Stop" : "Read"}
            </button>
          )}

          {uploading !== null && <span className="text-xs text-muted">Indexing… {uploading < 100 ? `${uploading}%` : "processing"}</span>}

          {/* RAG docs checkbox */}
          <label className={`flex items-center gap-1.5 text-xs ${docCount ? "cursor-pointer text-fg" : "text-muted"}`} title={docCount ? "" : "Upload a document first"}>
            <input type="checkbox" className="accent-[rgb(var(--accent))]" checked={useDocs && docCount > 0} disabled={!docCount} onChange={(e) => onUseDocs(e.target.checked)} />
            Docs{docCount ? ` (${docCount})` : ""}
          </label>

          {/* Send / Stop */}
          <div className="ml-auto">
            {streaming ? (
              <button className="btn !px-2.5 bg-fg text-bg" onClick={onStop} aria-label="Stop generating"><Square size={14} fill="currentColor" /></button>
            ) : (
              <button className="btn-primary !px-2.5" onClick={submit} disabled={!text.trim() && !attachedImage} aria-label="Send message"><ArrowUp size={18} /></button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted">AI can make mistakes. Check important info and cited sources.</p>
    </div>
  );
}
