import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths.js";

export type ProviderId = "ollama" | "anthropic" | "gemini" | "openai-compatible";

export interface ProviderSettings {
  ollama: { baseURL: string; model: string; useGpu: boolean };
  anthropic: { apiKey: string; model: string };
  gemini: { apiKey: string; model: string };
  "openai-compatible": { baseURL: string; apiKey: string; model: string };
}

export interface Settings {
  activeProvider: ProviderId;
  bearerToken: string;
  providers: ProviderSettings;
}

export const defaultSettings: Settings = {
  activeProvider: "ollama",
  bearerToken: "",
  providers: {
    ollama: { baseURL: "http://127.0.0.1:11434/v1", model: "qwen2.5:7b", useGpu: true },
    anthropic: { apiKey: "", model: "claude-sonnet-5-5" },
    gemini: { apiKey: "", model: "gemini-4-hydrogen" },
    "openai-compatible": {
      baseURL: "http://127.0.0.1:8080/v1",
      apiKey: "",
      model: "",
    },
  },
};

const providers: ProviderId[] = ["ollama", "anthropic", "gemini", "openai-compatible"];

export function settingsPath() {
  return path.join(dataDir, "settings.json");
}

export function loadSettings(): Settings {
  const file = settingsPath();
  if (!fs.existsSync(file)) return structuredClone(defaultSettings);
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Settings>;
  const next = structuredClone(defaultSettings);
  if (parsed.activeProvider && providers.includes(parsed.activeProvider)) {
    next.activeProvider = parsed.activeProvider;
  }
  if (typeof parsed.bearerToken === "string") next.bearerToken = parsed.bearerToken;
  const incoming = parsed.providers ?? ({} as Partial<ProviderSettings>);
  next.providers.ollama = { ...next.providers.ollama, ...incoming.ollama };
  next.providers.ollama.useGpu = incoming.ollama?.useGpu !== false;
  next.providers.anthropic = { ...next.providers.anthropic, ...incoming.anthropic };
  next.providers.gemini = { ...next.providers.gemini, ...incoming.gemini };
  next.providers["openai-compatible"] = {
    ...next.providers["openai-compatible"],
    ...incoming["openai-compatible"],
  };
  return next;
}

export function saveSettings(settings: Settings) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

export function explainModelError(error: unknown, settings: Settings): string {
  const message = error instanceof Error ? error.message : String(error);
  if (settings.activeProvider === "ollama" && /fetch failed|ECONNREFUSED|ENOTFOUND|other side closed|connect/i.test(message)) {
    return `Ollama did not respond at ${settings.providers.ollama.baseURL}. Start Ollama and pull ${settings.providers.ollama.model}, or choose another provider in Settings.`;
  }
  if (/api key|unauthorized|401|invalid x-api-key/i.test(message)) {
    return "The provider rejected the API key. Update it in Settings and try again.";
  }
  return message;
}
