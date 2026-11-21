import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const dataDir = path.join(rootDir, "data");
export const conversationsDir = path.join(dataDir, "conversations");
export const reviewsDir = path.join(dataDir, "reviews");

export const HOST = "127.0.0.1";
export const PORT = Number(process.env.PORT ?? 3920);

export function publicUrls() {
  const origin = `http://${HOST}:${PORT}`;
  return {
    origin,
    openai: `${origin}/v1`,
    mcp: `${origin}/mcp`,
  };
}
