import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { Settings } from "./settings.js";

export function activeModel(settings: Settings): LanguageModel {
  const { activeProvider, providers } = settings;
  if (activeProvider === "ollama") {
    const model = providers.ollama.model.trim();
    if (!model) throw new Error("Set an Ollama model name in Settings.");
    return createOpenAI({
      baseURL: providers.ollama.baseURL.trim(),
      apiKey: "ollama",
    }).chat(model);
  }
  if (activeProvider === "anthropic") {
    const apiKey = providers.anthropic.apiKey.trim();
    const model = providers.anthropic.model.trim();
    if (!apiKey) throw new Error("Add an Anthropic API key in Settings.");
    if (!model) throw new Error("Set an Anthropic model name in Settings.");
    return createAnthropic({ apiKey })(model);
  }
  if (activeProvider === "gemini") {
    const apiKey = providers.gemini.apiKey.trim();
    const model = providers.gemini.model.trim();
    if (!apiKey) throw new Error("Add a Gemini API key in Settings.");
    if (!model) throw new Error("Set a Gemini model name in Settings.");
    return createGoogleGenerativeAI({ apiKey })(model);
  }
  const compatible = providers["openai-compatible"];
  const model = compatible.model.trim();
  const baseURL = compatible.baseURL.trim();
  if (!baseURL) throw new Error("Set the OpenAI-compatible base URL in Settings.");
  if (!model) throw new Error("Set the OpenAI-compatible model name in Settings.");
  return createOpenAI({
    baseURL,
    apiKey: compatible.apiKey.trim() || "local",
  }).chat(model);
}

export function activeModelName(settings: Settings) {
  if (settings.activeProvider === "ollama") return settings.providers.ollama.model.trim();
  if (settings.activeProvider === "anthropic") return settings.providers.anthropic.model.trim();
  if (settings.activeProvider === "gemini") return settings.providers.gemini.model.trim();
  return settings.providers["openai-compatible"].model.trim();
}
