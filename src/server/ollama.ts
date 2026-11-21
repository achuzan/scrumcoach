import type { ModelMessage } from "ai";
import type { Settings } from "./settings.js";

interface OllamaChatEvent {
  message?: { content?: string };
  error?: string;
  done?: boolean;
}

export function ollamaOrigin(baseURL: string) {
  const url = new URL(baseURL);
  url.pathname = url.pathname.replace(/\/v1\/?$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function messageText(content: ModelMessage["content"]) {
  if (typeof content === "string") return content;
  return content
    .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
    .join("");
}

function chatMessages(system: string, messages: ModelMessage[]) {
  const chat = messages.map((message) => ({
    role: message.role,
    content: messageText(message.content),
  }));
  if (!system.trim()) return chat;
  return [{ role: "system", content: system }, ...chat];
}

async function postChat(settings: Settings, body: unknown) {
  const origin = ollamaOrigin(settings.providers.ollama.baseURL);
  try {
    return await fetch(`${origin}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const detail = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : String(error);
    throw new Error(`fetch failed: ${detail}`);
  }
}

export async function* streamOllama(settings: Settings, system: string, messages: ModelMessage[]) {
  const response = await postChat(settings, {
    model: settings.providers.ollama.model.trim(),
    messages: chatMessages(system, messages),
    stream: true,
    options: { num_gpu: settings.providers.ollama.useGpu ? -1 : 0 },
  });
  if (!response.ok || !response.body) {
    throw new Error(await response.text().catch(() => `Ollama returned ${response.status}.`));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as OllamaChatEvent;
      if (event.error) throw new Error(event.error);
      if (event.message?.content) yield event.message.content;
    }
  }
}

export async function completeOllama(settings: Settings, system: string, messages: ModelMessage[]) {
  let text = "";
  for await (const piece of streamOllama(settings, system, messages)) text += piece;
  return text;
}

export async function ollamaProcessor(settings: Settings): Promise<"gpu" | "mixed" | "cpu" | "unknown"> {
  const model = settings.providers.ollama.model.trim();
  const response = await fetch(`${ollamaOrigin(settings.providers.ollama.baseURL)}/api/ps`);
  if (!response.ok) return "unknown";
  const data = (await response.json()) as {
    models?: { name?: string; model?: string; size?: number; size_vram?: number }[];
  };
  const loaded = (data.models ?? []).find((item) => item.name === model || item.model === model || item.name?.startsWith(`${model}:`));
  if (!loaded) return "unknown";
  const vram = Number(loaded.size_vram ?? 0);
  const size = Number(loaded.size ?? 0);
  if (vram <= 0) return "cpu";
  if (size > 0 && vram < size * 0.9) return "mixed";
  return "gpu";
}
