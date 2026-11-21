import fs from "node:fs";
import path from "node:path";
import type { PublicSource } from "../shared/types.js";
import { conversationsDir } from "./paths.js";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: PublicSource[];
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

function fileFor(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Unknown conversation.");
  return path.join(conversationsDir, `${id}.json`);
}

export function listConversations() {
  if (!fs.existsSync(conversationsDir)) return [];
  return fs
    .readdirSync(conversationsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(conversationsDir, name), "utf8")) as Conversation)
    .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getConversation(id: string) {
  const file = fileFor(id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as Conversation;
}

export function saveConversation(conversation: Conversation) {
  fs.mkdirSync(conversationsDir, { recursive: true });
  conversation.updatedAt = new Date().toISOString();
  fs.writeFileSync(fileFor(conversation.id), JSON.stringify(conversation, null, 2));
  return conversation;
}

export function createConversation(firstQuestion: string) {
  const conversation: Conversation = {
    id: crypto.randomUUID(),
    title: firstQuestion.replace(/\s+/g, " ").trim().slice(0, 72) || "New chat",
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  return saveConversation(conversation);
}

export function deleteConversation(id: string) {
  const file = fileFor(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
