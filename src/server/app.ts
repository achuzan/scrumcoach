import { Hono } from "hono";
import { prepareAnswer, readAnswerStream, reviewDocument, streamAnswer, testActiveProvider } from "./coach.js";
import { createGuidance, deleteGuidance, getGuidance, listGuidance, updateGuidance } from "./guidance.js";
import { bearerStatus, contentToString, errorMessage, sse } from "./http.js";
import { textFromUpload, textFromUrl } from "./ingest.js";
import { handleMcpRequest } from "./mcp.js";
import { publicUrls } from "./paths.js";
import { activeModelName } from "./providers.js";
import { deleteReview, getReview, listReviews, saveReview } from "./reviews.js";
import {
  explainModelError,
  loadSettings,
  saveSettings,
  type ProviderId,
  type Settings,
} from "./settings.js";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  saveConversation,
  type Conversation,
} from "./store.js";

const providers: ProviderId[] = ["ollama", "anthropic", "gemini", "openai-compatible"];

export const app = new Hono();

app.onError((error, c) => {
  const message = errorMessage(error);
  const status = message === "Unauthorized" ? 401 : 400;
  return c.json({ error: message }, status);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/info", (c) => {
  const settings = loadSettings();
  return c.json({
    ...publicUrls(),
    activeProvider: settings.activeProvider,
    model: activeModelName(settings),
  });
});

app.get("/api/settings", (c) => c.json(loadSettings()));

app.put("/api/settings", async (c) => {
  const body = (await c.req.json()) as Settings;
  if (!providers.includes(body.activeProvider)) {
    return c.json({ error: "Choose a provider." }, 400);
  }
  saveSettings(body);
  return c.json(loadSettings());
});

app.post("/api/settings/test", async (c) => {
  try {
    const text = await testActiveProvider();
    return c.json({ ok: true, text });
  } catch (error) {
    return c.json({ ok: false, error: explainModelError(error, loadSettings()) }, 400);
  }
});

app.get("/api/conversations", (c) => c.json(listConversations()));

app.get("/api/conversations/:id", (c) => {
  const conversation = getConversation(c.req.param("id"));
  if (!conversation) return c.json({ error: "Unknown conversation." }, 404);
  return c.json(conversation);
});

app.delete("/api/conversations/:id", (c) => {
  deleteConversation(c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/api/chat", async (c) => {
  const body = (await c.req.json()) as { conversationId?: string; content?: string };
  const content = String(body.content ?? "").trim();
  if (!content) return c.json({ error: "Write a question first." }, 400);

  let conversation: Conversation | null = body.conversationId ? getConversation(body.conversationId) : null;
  if (body.conversationId && !conversation) return c.json({ error: "Unknown conversation." }, 404);
  if (!conversation) conversation = createConversation(content);
  conversation.messages.push({ id: crypto.randomUUID(), role: "user", content });
  saveConversation(conversation);

  const history = conversation.messages.slice(-8).map((message) => ({
    role: message.role,
    content: message.content,
  }));
  let prepared;
  try {
    prepared = prepareAnswer(content);
  } catch (error) {
    return c.json({ error: errorMessage(error) }, 400);
  }

  const encoder = new TextEncoder();
  const current = conversation;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };
      send("meta", { conversationId: current.id, sources: prepared.sources });
      let full = "";
      try {
        const result = streamAnswer(history, prepared);
        full = await readAnswerStream(result, (delta) => send("delta", { text: delta }));
        current.messages.push({
          id: crypto.randomUUID(),
          role: "assistant",
          content: full,
          sources: prepared.sources,
        });
        saveConversation(current);
        send("done", {});
      } catch (error) {
        if (full.trim()) {
          current.messages.push({
            id: crypto.randomUUID(),
            role: "assistant",
            content: full,
            sources: prepared.sources,
          });
          saveConversation(current);
        }
        send("error", { message: explainModelError(error, loadSettings()) });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
});

app.get("/api/guidance", (c) => c.json(listGuidance()));

app.get("/api/guidance/:id", (c) => {
  const note = getGuidance(c.req.param("id"));
  if (!note) return c.json({ error: "Unknown guidance note." }, 404);
  return c.json(note);
});

app.post("/api/guidance", async (c) => {
  const body = (await c.req.json()) as { title?: string; body?: string; source?: "manual" | "chat" };
  const note = createGuidance({
    title: String(body.title ?? ""),
    body: String(body.body ?? ""),
    source: body.source === "chat" ? "chat" : "manual",
  });
  return c.json(note);
});

app.put("/api/guidance/:id", async (c) => {
  const body = (await c.req.json()) as { title?: string; body?: string };
  const note = updateGuidance(c.req.param("id"), {
    title: String(body.title ?? ""),
    body: String(body.body ?? ""),
  });
  return c.json(note);
});

app.delete("/api/guidance/:id", (c) => {
  deleteGuidance(c.req.param("id"));
  return c.json({ ok: true });
});

app.get("/api/reviews", (c) => c.json(listReviews()));

app.get("/api/reviews/:id", (c) => {
  const review = getReview(c.req.param("id"));
  if (!review) return c.json({ error: "Unknown review." }, 404);
  return c.json(review);
});

app.delete("/api/reviews/:id", (c) => {
  deleteReview(c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/api/review", async (c) => {
  const type = c.req.header("content-type") ?? "";
  let text = "";
  let kind: "paste" | "file" | "url" = "paste";
  let label = "Pasted text";
  if (type.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) return c.json({ error: "Choose a file." }, 400);
    if (file.size > 2_000_000) return c.json({ error: "Files need to be under 2 MB." }, 400);
    kind = "file";
    label = file.name;
    text = await textFromUpload(file.name, Buffer.from(await file.arrayBuffer()));
  } else {
    const body = (await c.req.json()) as { text?: string; url?: string };
    if (body.url) {
      kind = "url";
      label = String(body.url);
      text = await textFromUrl(label);
    } else {
      text = String(body.text ?? "");
      label = text.split("\n").map((line) => line.trim()).find(Boolean)?.slice(0, 80) || "Pasted text";
    }
  }
  if (!text.trim()) return c.json({ error: "There is no text to review." }, 400);
  try {
    const settings = loadSettings();
    const review = await reviewDocument(text);
    const saved = saveReview({
      title: label,
      kind,
      label,
      model: activeModelName(settings) || settings.activeProvider,
      excerpt: text.trim(),
      summary: review.summary,
      findings: review.findings,
      sources: review.sources,
    });
    return c.json(saved);
  } catch (error) {
    return c.json({ error: explainModelError(error, loadSettings()) }, 400);
  }
});

app.get("/v1/models", (c) => {
  const denied = bearerStatus(c.req.raw);
  if (denied) return denied;
  const settings = loadSettings();
  const id = activeModelName(settings) || "scrum-coach";
  return c.json({
    object: "list",
    data: [{ id, object: "model", owned_by: "scrum-coach" }],
  });
});

app.post("/v1/chat/completions", async (c) => {
  const denied = bearerStatus(c.req.raw);
  if (denied) return denied;
  const body = (await c.req.json()) as {
    stream?: boolean;
    messages?: { role?: string; content?: unknown }[];
  };
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...incoming].reverse().find((message) => message.role === "user");
  const question = contentToString(lastUser?.content).trim();
  if (!question) return c.json({ error: { message: "Send a user message." } }, 400);

  const messages = incoming
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: contentToString(message.content),
    }))
    .slice(-8);

  const prepared = prepareAnswer(question);
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const model = activeModelName(loadSettings()) || "scrum-coach";

  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          const result = streamAnswer(messages, prepared);
          await readAnswerStream(result, (delta) => {
            send({
              id,
              object: "chat.completion.chunk",
              model,
              choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
            });
          });
          send({
            id,
            object: "chat.completion.chunk",
            model,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (error) {
          send({ error: { message: explainModelError(error, loadSettings()) } });
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  try {
    const { completeAnswer } = await import("./coach.js");
    const text = await completeAnswer(messages, prepared);
    return c.json({
      id,
      object: "chat.completion",
      model,
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
      sources: prepared.sources,
    });
  } catch (error) {
    return c.json({ error: { message: explainModelError(error, loadSettings()) } }, 400);
  }
});

app.all("/mcp", (c) => handleMcpRequest(c.req.raw));
