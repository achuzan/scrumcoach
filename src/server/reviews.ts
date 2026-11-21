import fs from "node:fs";
import path from "node:path";
import type { PublicSource } from "../shared/types.js";
import type { ReviewFinding } from "./coach.js";
import { reviewsDir } from "./paths.js";

export interface SavedReview {
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

function fileFor(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Unknown review.");
  return path.join(reviewsDir, `${id}.json`);
}

export function listReviews() {
  if (!fs.existsSync(reviewsDir)) return [];
  return fs
    .readdirSync(reviewsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(reviewsDir, name), "utf8")) as SavedReview)
    .map(({ id, title, kind, createdAt, model }) => ({ id, title, kind, createdAt, model }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getReview(id: string) {
  const file = fileFor(id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as SavedReview;
}

export function saveReview(input: Omit<SavedReview, "id" | "createdAt">) {
  const review: SavedReview = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    excerpt: input.excerpt.slice(0, 1200),
    title: input.title.replace(/\s+/g, " ").trim().slice(0, 80) || "Reviewed document",
  };
  fs.mkdirSync(reviewsDir, { recursive: true });
  fs.writeFileSync(fileFor(review.id), JSON.stringify(review, null, 2));
  return review;
}

export function deleteReview(id: string) {
  const file = fileFor(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
