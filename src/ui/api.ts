import type { PublicSource } from "../shared/types";

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: PublicSource[];
}

export interface Conversation extends ConversationSummary {
  messages: ChatMessage[];
}

export interface GuidanceNote {
  id: string;
  title: string;
  body: string;
  created: string;
  source: "manual" | "chat";
}

export interface Settings {
  activeProvider: "ollama" | "anthropic" | "gemini" | "openai-compatible";
  bearerToken: string;
  providers: {
    ollama: { baseURL: string; model: string; useGpu: boolean };
    anthropic: { apiKey: string; model: string };
    gemini: { apiKey: string; model: string };
    "openai-compatible": { baseURL: string; apiKey: string; model: string };
  };
}

export interface ReviewFinding {
  quote: string;
  issue: string;
  source: string;
  suggestion: string;
}

export interface ReviewResponse {
  id: string;
  title: string;
  kind: "paste" | "file" | "url";
  label: string;
  createdAt: string;
  model: string;
  excerpt: string;
  summary: string;
  findings: ReviewFinding[];
  sources: PublicSource[];
}

export interface ReviewSummary {
  id: string;
  title: string;
  kind: "paste" | "file" | "url";
  createdAt: string;
  model: string;
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string | { message?: string } } | null;
  if (typeof body?.error === "string") return body.error;
  if (body?.error && typeof body.error.message === "string") return body.error.message;
  return response.statusText || "Request failed.";
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as T;
}

export const api = {
  info: () => request<{ origin: string; openai: string; mcp: string; activeProvider: string; model: string }>("/api/info"),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (settings: Settings) => request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(settings) }),
  testSettings: () => request<{ ok: boolean; text: string }>("/api/settings/test", { method: "POST" }),
  conversations: () => request<ConversationSummary[]>("/api/conversations"),
  conversation: (id: string) => request<Conversation>(`/api/conversations/${id}`),
  deleteConversation: (id: string) => request<{ ok: boolean }>(`/api/conversations/${id}`, { method: "DELETE" }),
  guidance: () => request<GuidanceNote[]>("/api/guidance"),
  createGuidance: (note: { title: string; body: string; source?: "manual" | "chat" }) =>
    request<GuidanceNote>("/api/guidance", { method: "POST", body: JSON.stringify(note) }),
  updateGuidance: (id: string, note: { title: string; body: string }) =>
    request<GuidanceNote>(`/api/guidance/${id}`, { method: "PUT", body: JSON.stringify(note) }),
  deleteGuidance: (id: string) => request<{ ok: boolean }>(`/api/guidance/${id}`, { method: "DELETE" }),
  reviews: () => request<ReviewSummary[]>("/api/reviews"),
  reviewRecord: (id: string) => request<ReviewResponse>(`/api/reviews/${id}`),
  deleteReview: (id: string) => request<{ ok: boolean }>(`/api/reviews/${id}`, { method: "DELETE" }),
  review: (payload: { text?: string; url?: string }) =>
    request<ReviewResponse>("/api/review", { method: "POST", body: JSON.stringify(payload) }),
  reviewFile: (file: File) => {
    const body = new FormData();
    body.set("file", file);
    return request<ReviewResponse>("/api/review", { method: "POST", body });
  },
};

export async function streamChat(
  conversationId: string | null,
  content: string,
  handlers: {
    onMeta: (meta: { conversationId: string; sources: PublicSource[] }) => void;
    onDelta: (text: string) => void;
  },
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId, content }),
  });
  if (!response.ok || !response.body) throw new Error(await readError(response));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const event = part.match(/^event: (.+)$/m)?.[1] ?? "message";
      const dataLine = part
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      const data = dataLine ? (JSON.parse(dataLine) as { text?: string; message?: string; conversationId?: string; sources?: PublicSource[] }) : {};
      if (event === "meta" && data.conversationId) {
        handlers.onMeta({ conversationId: data.conversationId, sources: data.sources ?? [] });
      }
      if (event === "delta" && data.text) handlers.onDelta(data.text);
      if (event === "error") throw new Error(data.message || "The model request failed.");
    }
  }
}
