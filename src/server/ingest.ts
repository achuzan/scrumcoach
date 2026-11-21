import path from "node:path";
import mammoth from "mammoth";

const textExtensions = new Set([".md", ".markdown", ".txt", ".text", ".html", ".htm"]);

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<h([1-4])[^>]*>/gi, (_, level: string) => `\n\n${"#".repeat(Number(level))} `)
    .replace(/<\/h[1-4]>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function textFromUpload(filename: string, bytes: Buffer) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result.value.trim();
  }
  if (extension === ".html" || extension === ".htm") return htmlToText(bytes.toString("utf8"));
  if (textExtensions.has(extension)) return bytes.toString("utf8").trim();
  throw new Error("Use a Word document (.docx), Markdown, text, or HTML file.");
}

export async function textFromUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a full http or https URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Enter a full http or https URL.");
  }
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
    headers: { "user-agent": "scrum-coach", accept: "text/html, text/plain, text/markdown" },
  });
  if (!response.ok) throw new Error(`The page returned ${response.status}.`);
  const body = await response.text();
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("html") || /^\s*</.test(body)) return htmlToText(body);
  return body.trim();
}
