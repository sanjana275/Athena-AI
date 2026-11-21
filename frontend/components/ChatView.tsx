"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useChats } from "@/lib/chats";
import { streamChat, type StreamBody } from "@/lib/stream";
import type { ChatSummary, DocumentItem, Message } from "@/lib/types";
import { Composer } from "./Composer";
import { Logo } from "./Logo";
import { MessageBubble } from "./MessageBubble";
import { ModelSelector, GROQ_MODELS } from "./ModelSelector";
import { useToast } from "./Toast";

const SUGGESTIONS = [
  { title: "Explain a concept", text: "Explain how transformers work, with a simple example." },
  { title: "Write code", text: "Write a Python function that merges two sorted lists, and explain its complexity." },
  { title: "Summarize my documents", text: "Summarize the key points of my uploaded documents." },
  { title: "Plan something", text: "Make a 4-week study plan to learn SQL from scratch." },
];

const PLACEHOLDER_USER = -1;
const PLACEHOLDER_ASSISTANT = -2;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function ChatView({ chatId }: { chatId?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { refresh } = useChats();
  const toast = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(!!chatId);
  const [streaming, setStreaming] = useState(false);
  const [docCount, setDocCount] = useState(0);
  const [useDocs, setUseDocs] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("athena_model");
      if (saved && GROQ_MODELS.some((m) => m.id === saved)) return saved;
    }
    return GROQ_MODELS[0].id;
  });
  const selectedModelRef = useRef(selectedModel);
  selectedModelRef.current = selectedModel;
  const [lastAiReply, setLastAiReply] = useState<string | undefined>();

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const useDocsRef = useRef(false);
  useDocsRef.current = useDocs;

  const loadDocs = useCallback(() => {
    api<DocumentItem[]>("/documents").then((d) => setDocCount(d.length)).catch(() => {});
  }, []);
  useEffect(loadDocs, [loadDocs]);

  const sync = useCallback(async (id: string) => {
    try {
      const data = await api<{ chat: ChatSummary; messages: Message[] }>(`/chats/${id}`);
      setMessages(data.messages);
      // Track last AI reply for text-to-voice
      const last = [...data.messages].reverse().find((m) => m.role === "assistant");
      if (last) setLastAiReply(last.content);
    } catch {}
  }, []);

  const run = useCallback(async (id: string, body: StreamBody) => {
    const controller = new AbortController();
    abortRef.current = controller;
    stick.current = true;
    setStreaming(true);
    let aid = PLACEHOLDER_ASSISTANT;
    const patch = (fn: (m: Message) => Message) =>
      setMessages((ms) => ms.map((m) => (m.id === aid ? fn(m) : m)));
    let failed = false;
    let accumulated = "";
    try {
      await streamChat(id, { ...body, use_documents: useDocsRef.current, model_id: selectedModelRef.current }, {
        onMeta: (meta) => {
          if (meta.user_message_id != null)
            setMessages((ms) => ms.map((m) => (m.id === PLACEHOLDER_USER ? { ...m, id: meta.user_message_id! } : m)));
          if (meta.title) refresh();
        },
        onSources: (sources) => patch((m) => ({ ...m, sources })),
        onToken: (t) => {
          accumulated += t;
          patch((m) => ({ ...m, content: m.content + t }));
        },
        onError: (msg) => { failed = true; toast(msg, "error"); },
      }, controller.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") { failed = true; toast("Connection lost while generating.", "error"); }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      if (accumulated) setLastAiReply(accumulated);
      await new Promise((r) => setTimeout(r, controller.signal.aborted || failed ? 500 : 0));
      await sync(id);
      refresh();
    }
  }, [refresh, sync, toast]);

  // Load an existing chat (and auto-send a message queued by the "new chat" screen)
  useEffect(() => {
    if (!chatId) { setMessages([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    api<{ chat: ChatSummary; messages: Message[] }>(`/chats/${chatId}`)
      .then((d) => {
        if (cancelled) return;
        setMessages(d.messages);
        const last = [...d.messages].reverse().find((m) => m.role === "assistant");
        if (last) setLastAiReply(last.content);
        const raw = sessionStorage.getItem(`pending:${chatId}`);
        if (raw) {
          sessionStorage.removeItem(`pending:${chatId}`);
          const p = JSON.parse(raw) as { content: string; useDocs: boolean };
          setUseDocs(p.useDocs);
          useDocsRef.current = p.useDocs;
          setMessages([...d.messages, tempUser(p.content), tempAssistant()]);
          run(chatId, { content: p.content });
        }
      })
      .catch((e) => { if (e instanceof ApiError && e.status === 404) router.replace("/chat"); })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; abortRef.current?.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const tempUser = (content: string): Message => ({ id: PLACEHOLDER_USER, role: "user", content, sources: [], feedback: null, created_at: new Date().toISOString() });
  const tempAssistant = (): Message => ({ id: PLACEHOLDER_ASSISTANT, role: "assistant", content: "", sources: [], feedback: null, created_at: new Date().toISOString() });

  async function send(text: string) {
    const displayText = text.replace(/!\[([^\]]*)\]\(data:image\/[^)]+\)/g, (_, alt) => `📎 [${alt || "image"}]`).trim();
    if (!chatId) {
      try {
        const c = await api<ChatSummary>("/chats", { method: "POST", json: {} });
        sessionStorage.setItem(`pending:${c.id}`, JSON.stringify({ content: text, useDocs }));
        router.push(`/chat/${c.id}`);
      } catch (e) { toast((e as Error).message, "error"); }
      return;
    }
    setMessages((ms) => [...ms, tempUser(displayText), tempAssistant()]);
    run(chatId, { content: text });
  }

  function regenerate() {
    if (!chatId || streaming) return;
    setMessages((ms) => [...ms.slice(0, -1), tempAssistant()]);
    run(chatId, { regenerate: true });
  }

  function edit(id: number, content: string) {
    if (!chatId || streaming) return;
    setMessages((ms) => {
      const i = ms.findIndex((m) => m.id === id);
      return [...ms.slice(0, i), { ...ms[i], content }, tempAssistant()];
    });
    run(chatId, { edit_message_id: id, content });
  }

  async function feedback(id: number, value: number) {
    setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, feedback: value || null } : m)));
    try { await api(`/messages/${id}/feedback`, { method: "PATCH", json: { value } }); if (value) toast("Thanks for the feedback"); }
    catch (e) { toast((e as Error).message, "error"); }
  }

  const empty = !loading && messages.length === 0;
  const currentModel = GROQ_MODELS.find((m) => m.id === selectedModel) ?? GROQ_MODELS[0];

  return (
    <div className="flex h-full flex-col">
      {/* Top model bar */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 bg-panel/80 backdrop-blur-sm">
        <ModelSelector value={selectedModel} onChange={setSelectedModel} />
        <span className="text-xs text-muted hidden sm:block">
          {currentModel.badge} · {currentModel.desc}
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {loading ? (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-8" aria-label="Loading chat">
            {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-raised" />)}
          </div>
        ) : empty ? (
          <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-4 py-10">
            <div className="relative group mb-1">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-indigo-500/20 blur-md opacity-75" />
              <div className="relative rounded-2xl border border-amber-500/30 bg-[#0d091a] p-1 shadow-xl">
                <Logo size={54} />
              </div>
            </div>
            <h1 className="mt-4 text-center text-2xl font-semibold">{greeting()}, {user?.name.split(" ")[0]}</h1>
            <p className="mt-1 text-muted">What can I help you with?</p>
            <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s.title} onClick={() => send(s.text)} className="rounded-xl border border-line bg-panel p-4 text-left transition-colors hover:bg-raised">
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="mt-1 text-sm text-muted">{s.text}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
            {messages.map((m, i) => (
              <MessageBubble key={m.id} message={m} isLast={i === messages.length - 1} streaming={streaming} busy={streaming}
                onRegenerate={regenerate} onEdit={edit} onFeedback={feedback} />
            ))}
          </div>
        )}
      </div>
      <Composer
        streaming={streaming}
        docCount={docCount}
        useDocs={useDocs}
        onUseDocs={setUseDocs}
        onSend={send}
        onStop={() => abortRef.current?.abort()}
        onUploaded={loadDocs}
        lastAiReply={lastAiReply}
      />
    </div>
  );
}
