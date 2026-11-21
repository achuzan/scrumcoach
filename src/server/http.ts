import { loadSettings } from "./settings.js";

export function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String(part.text ?? "");
        return "";
      })
      .join("");
  }
  return "";
}

export function bearerStatus(request: Request) {
  const token = loadSettings().bearerToken.trim();
  if (!token) return null;
  if (request.headers.get("authorization") === `Bearer ${token}`) return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
