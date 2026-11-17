export type Settings = {
  system_prompt: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  theme: "dark" | "light";
  username?: string;
  builder_name?: string;
  age?: string;
  memory_enabled?: boolean;
  memory_summary?: string;
  archived_chats?: string[];
  [key: string]: any;
};
export type User = {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  provider: "password" | "google";
  settings: Settings;
  created_at: string;
};
export type Source = { document_id: string; filename: string; location: string; content: string; score: number };
export type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  feedback: number | null;
  created_at: string;
};
export type ChatSummary = { id: string; title: string; created_at: string; updated_at: string };
export type DocumentItem = { id: string; filename: string; pages: number; chunk_count: number; created_at: string };
export type SessionItem = { id: string; user_agent: string; created_at: string; current: boolean };
