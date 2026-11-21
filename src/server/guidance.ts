import fs from "node:fs";
import path from "node:path";
import { loadAgent } from "./agent.js";
import { rootDir } from "./paths.js";

export interface GuidanceNote {
  id: string;
  title: string;
  body: string;
  created: string;
  source: "manual" | "chat";
}

function guidanceDirectory() {
  const { config } = loadAgent();
  const document = config.documents.find((item) => item.id === "guidance");
  if (!document) throw new Error("The agent config has no guidance folder.");
  const dir = path.join(rootDir, document.path);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeId(id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Unknown guidance note.");
  return id;
}

function quoteYaml(value: string) {
  return JSON.stringify(value);
}

function parseNote(id: string, raw: string): GuidanceNote {
  let title = id;
  let created = "";
  let source: GuidanceNote["source"] = "manual";
  let body = raw;
  if (raw.startsWith("---\n")) {
    const end = raw.indexOf("\n---", 3);
    if (end >= 0) {
      const front = raw.slice(4, end);
      body = raw.slice(end + 4).trim();
      const titleMatch = front.match(/^title:\s*(.+)$/m);
      const createdMatch = front.match(/^created:\s*(.+)$/m);
      const sourceMatch = front.match(/^source:\s*(.+)$/m);
      if (titleMatch) {
        const value = titleMatch[1].trim();
        try {
          title = value.startsWith('"') ? (JSON.parse(value) as string) : value;
        } catch {
          title = value.replace(/^"|"$/g, "");
        }
      }
      if (createdMatch) created = createdMatch[1].trim();
      if (sourceMatch?.[1].trim() === "chat") source = "chat";
    }
  }
  return { id, title, body, created, source };
}

function serialize(note: GuidanceNote) {
  return `---\ntitle: ${quoteYaml(note.title)}\ncreated: ${note.created}\nsource: ${note.source}\n---\n\n${note.body.trim()}\n`;
}

export function listGuidance(): GuidanceNote[] {
  const dir = guidanceDirectory();
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const id = name.slice(0, -3);
      return parseNote(id, fs.readFileSync(path.join(dir, name), "utf8"));
    })
    .sort((a, b) => b.created.localeCompare(a.created));
}

export function getGuidance(id: string) {
  const file = path.join(guidanceDirectory(), `${safeId(id)}.md`);
  if (!fs.existsSync(file)) return null;
  return parseNote(id, fs.readFileSync(file, "utf8"));
}

function slug(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base || "note"}-${suffix}`;
}

export function createGuidance(input: { title: string; body: string; source?: GuidanceNote["source"] }) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("Give the guidance note a title.");
  if (!body) throw new Error("Write the guidance you want the coach to follow.");
  const note: GuidanceNote = {
    id: slug(title),
    title,
    body,
    created: new Date().toISOString(),
    source: input.source ?? "manual",
  };
  fs.writeFileSync(path.join(guidanceDirectory(), `${note.id}.md`), serialize(note));
  return note;
}

export function updateGuidance(id: string, input: { title: string; body: string }) {
  const existing = getGuidance(id);
  if (!existing) throw new Error("Unknown guidance note.");
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) throw new Error("A guidance note needs a title and a body.");
  const note: GuidanceNote = { ...existing, title, body };
  fs.writeFileSync(path.join(guidanceDirectory(), `${note.id}.md`), serialize(note));
  return note;
}

export function deleteGuidance(id: string) {
  const file = path.join(guidanceDirectory(), `${safeId(id)}.md`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
