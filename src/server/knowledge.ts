import fs from "node:fs";
import path from "node:path";
import MiniSearch from "minisearch";
import type { PublicSource } from "../shared/types.js";
import { loadAgent, type DocumentSet } from "./agent.js";
import { rootDir } from "./paths.js";

export interface Chunk {
  id: string;
  source: string;
  label: string;
  authority: number;
  file: string;
  heading: string;
  text: string;
}

interface IndexedChunk extends Chunk {
  searchText: string;
}

let mini: MiniSearch<IndexedChunk> | null = null;
let byId = new Map<string, Chunk>();
let guidanceStamp = "";

function listMarkdown(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) found.push(full);
  }
  return found;
}

function guidanceDir(documents: DocumentSet[]) {
  const guide = documents.find((document) => document.id === "guidance");
  return guide ? path.join(rootDir, guide.path) : "";
}

function stampOf(dir: string) {
  if (!dir || !fs.existsSync(dir)) return "0";
  return listMarkdown(dir)
    .map((file) => `${file}:${fs.statSync(file).mtimeMs}`)
    .join("|");
}

function frontMatterTitle(markdown: string) {
  if (!markdown.startsWith("---\n") && !markdown.startsWith("---\r\n")) return "";
  const end = markdown.indexOf("\n---", 3);
  if (end < 0) return "";
  const title = markdown.slice(0, end).match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? "";
  if (!title) return "";
  try {
    return title.startsWith('"') ? (JSON.parse(title) as string) : title;
  } catch {
    return title.replace(/^"|"$/g, "");
  }
}

function stripPreamble(markdown: string) {
  let text = markdown.replace(/^<!--[\s\S]*?-->\s*/, "");
  if (text.startsWith("---\n") || text.startsWith("---\r\n")) {
    const end = text.indexOf("\n---", 3);
    if (end >= 0) text = text.slice(end + 4);
  }
  return text.trim();
}

function chunkMarkdown(markdown: string) {
  const lines = stripPreamble(markdown).split(/\r?\n/);
  const sections: { heading: string; body: string[] }[] = [];
  let current = { heading: "Introduction", body: [] as string[] };
  for (const line of lines) {
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      if (current.body.join("\n").trim()) sections.push(current);
      current = { heading: heading[2].replace(/\s+#+\s*$/, "").trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.join("\n").trim()) sections.push(current);

  const chunks: { heading: string; text: string }[] = [];
  for (const section of sections) {
    const body = section.body.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (body.length < 40) continue;
    if (body.length <= 1500) {
      chunks.push({ heading: section.heading, text: body });
      continue;
    }
    const paragraphs = body.split(/\n\s*\n/);
    let buffer = "";
    let part = 1;
    const flush = () => {
      if (buffer.trim().length < 40) {
        buffer = "";
        return;
      }
      chunks.push({
        heading: part === 1 ? section.heading : `${section.heading} (${part})`,
        text: buffer.trim(),
      });
      part += 1;
      buffer = "";
    };
    for (const paragraph of paragraphs) {
      if (buffer && buffer.length + paragraph.length > 1400) flush();
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    }
    flush();
  }
  return chunks;
}

export function rebuildIndex() {
  const { config } = loadAgent();
  const documents = [...config.documents].sort((a, b) => a.authority - b.authority);
  const next: Chunk[] = [];
  for (const document of documents) {
    const dir = path.join(rootDir, document.path);
    for (const file of listMarkdown(dir)) {
      const raw = fs.readFileSync(file, "utf8");
      const relative = path.relative(dir, file).replaceAll("\\", "/");
      const parts = chunkMarkdown(raw);
      const title = frontMatterTitle(raw);
      if (title) {
        for (const part of parts) {
          if (part.heading === "Introduction") part.heading = title;
        }
      }
      parts.forEach((part, index) => {
        next.push({
          id: `${document.id}:${relative}:${index}`,
          source: document.id,
          label: document.label,
          authority: document.authority,
          file: relative,
          heading: part.heading,
          text: part.text,
        });
      });
    }
  }

  const indexed: IndexedChunk[] = next.map((chunk) => ({
    ...chunk,
    searchText: `${chunk.heading}\n${chunk.text}`,
  }));
  mini = new MiniSearch<IndexedChunk>({
    fields: ["heading", "searchText", "label"],
    storeFields: ["id"],
    searchOptions: {
      boost: { heading: 2.4, label: 1.1 },
      prefix: true,
      fuzzy: 0.18,
      combineWith: "OR",
    },
  });
  mini.addAll(indexed);
  byId = new Map(next.map((chunk) => [chunk.id, chunk]));
  guidanceStamp = stampOf(guidanceDir(documents));
}

function ensureIndex() {
  const { config } = loadAgent();
  const stamp = stampOf(guidanceDir(config.documents));
  if (!mini || stamp !== guidanceStamp) rebuildIndex();
}

export function searchKnowledge(query: string, limit = 8): Chunk[] {
  ensureIndex();
  const cleaned = query.replace(/\s+/g, " ").trim().slice(0, 900);
  if (!cleaned || !mini) return [];
  const results = mini.search(cleaned);
  const picked = new Map<string, Chunk>();
  const quotas = [
    [1, 2],
    [2, 3],
    [3, 3],
  ] as const;
  for (const [authority, count] of quotas) {
    let added = 0;
    for (const result of results) {
      const chunk = byId.get(String(result.id));
      if (!chunk || chunk.authority !== authority || picked.has(chunk.id)) continue;
      picked.set(chunk.id, chunk);
      added += 1;
      if (added >= count || picked.size >= limit) break;
    }
    if (picked.size >= limit) break;
  }
  return [...picked.values()].sort((a, b) => a.authority - b.authority);
}

export function passagesForDocument(text: string, limit = 12): Chunk[] {
  const sections = text
    .split(/\n(?=#{1,3}\s)/)
    .map((section) => section.trim())
    .filter((section) => section.length > 80)
    .slice(0, 8);
  const queries = (sections.length > 0 ? sections : [text]).map((section) => section.slice(0, 700));
  const seen = new Set<string>();
  const picked: Chunk[] = [];
  for (const query of queries) {
    for (const chunk of searchKnowledge(query, 4)) {
      if (seen.has(chunk.id)) continue;
      seen.add(chunk.id);
      picked.push(chunk);
      if (picked.length >= limit) {
        return picked.sort((a, b) => a.authority - b.authority);
      }
    }
  }
  return picked.sort((a, b) => a.authority - b.authority);
}

export type { PublicSource } from "../shared/types.js";

export function toPublicSource(chunk: Chunk): PublicSource {
  return {
    label: chunk.label,
    heading: chunk.heading,
    file: chunk.file,
    authority: chunk.authority,
  };
}

export function formatPassages(chunks: Chunk[]) {
  if (chunks.length === 0) {
    return "No passages matched this question. Say that the library does not contain a matching passage.";
  }
  return chunks
    .map(
      (chunk) =>
        `### ${chunk.label} — ${chunk.heading}\nAuthority: ${chunk.authority}\nFile: ${chunk.file}\n\n${chunk.text}`,
    )
    .join("\n\n");
}
