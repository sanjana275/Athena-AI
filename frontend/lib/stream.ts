import { API } from "./api";
import type { Source } from "./types";

export type StreamBody = {
  content?: string;
  use_documents?: boolean;
  edit_message_id?: number;
  regenerate?: boolean;
  model_id?: string;
};

export type StreamHandlers = {
  onMeta?: (m: { user_message_id: number | null; title: string }) => void;
  onSources?: (s: Source[]) => void;
  onToken?: (t: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
};

/** POST + Server-Sent Events over fetch (EventSource can't POST). */
export async function streamChat(chatId: string, body: StreamBody, h: StreamHandlers, signal: AbortSignal) {
  const res = await fetch(`${API}/chats/${chatId}/stream`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = "Could not start the response.";
    try { const j = await res.json(); if (typeof j.detail === "string") msg = j.detail; } catch {}
    h.onError?.(msg);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const ev = JSON.parse(line.slice(6));
      if (ev.type === "meta") h.onMeta?.(ev);
      else if (ev.type === "sources") h.onSources?.(ev.sources);
      else if (ev.type === "token") h.onToken?.(ev.text);
      else if (ev.type === "done") h.onDone?.();
      else if (ev.type === "error") h.onError?.(ev.message);
    }
  }
}
