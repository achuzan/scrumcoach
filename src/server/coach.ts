import { generateText, streamText, type ModelMessage } from "ai";
import { loadAgent } from "./agent.js";
import { formatPassages, passagesForDocument, searchKnowledge, toPublicSource, type PublicSource } from "./knowledge.js";
import { completeOllama, ollamaProcessor, streamOllama } from "./ollama.js";
import { activeModel } from "./providers.js";
import { loadSettings, type Settings } from "./settings.js";

const reviewShape = `Reply with one JSON object and no markdown fence. Use this shape:
{
  "summary": "two or three sentences on how the document fits Scrum",
  "findings": [
    {
      "quote": "short quotation from the document",
      "issue": "what does not align, and which rule it misses",
      "source": "source label and heading",
      "suggestion": "a rewrite or practice that aligns with the authority order"
    }
  ]
}
When the document aligns, return an empty findings array and say so in the summary.`;

export interface PreparedTurn {
  system: string;
  sources: PublicSource[];
}

function systemWithPassages(extra: string, passages: string) {
  const { instructions } = loadAgent();
  return `${instructions.trim()}\n\n${extra.trim()}\n\n## Retrieved passages\n\n${passages}`;
}

export function prepareAnswer(question: string): PreparedTurn {
  const chunks = searchKnowledge(question, 8);
  return {
    system: systemWithPassages(
      "Answer the user's question or situation. Put the recommendation first.",
      formatPassages(chunks),
    ),
    sources: chunks.map(toPublicSource),
  };
}

export function prepareReview(documentText: string): PreparedTurn {
  const clipped = documentText.length > 24000 ? `${documentText.slice(0, 24000)}\n\n[The document was truncated for this review.]` : documentText;
  const chunks = passagesForDocument(clipped, 12);
  return {
    system: systemWithPassages(reviewShape, formatPassages(chunks)),
    sources: chunks.map(toPublicSource),
  };
}

export async function readAnswerStream(
  result: { fullStream: AsyncIterable<{ type: string; text?: string; error?: unknown }> },
  onDelta: (text: string) => void,
) {
  let text = "";
  let failure: unknown = null;
  for await (const part of result.fullStream) {
    if (part.type === "text-delta" && part.text) {
      text += part.text;
      onDelta(part.text);
    } else if (part.type === "error") {
      failure = part.error ?? new Error("The model request failed.");
    }
  }
  if (failure) throw failure instanceof Error ? failure : new Error(String(failure));
  if (!text.trim()) throw new Error("The model returned an empty answer.");
  return text;
}

async function* ollamaAnswerStream(settings: Settings, messages: ModelMessage[], system: string) {
  try {
    for await (const text of streamOllama(settings, system, messages)) {
      yield { type: "text-delta" as const, text };
    }
  } catch (error) {
    yield { type: "error" as const, error };
  }
}

export function streamAnswer(messages: ModelMessage[], prepared: PreparedTurn) {
  const settings = loadSettings();
  if (settings.activeProvider === "ollama") {
    return { fullStream: ollamaAnswerStream(settings, messages, prepared.system) };
  }
  return streamText({
    model: activeModel(settings),
    system: prepared.system,
    messages,
    maxRetries: 0,
  });
}

export async function completeAnswer(messages: ModelMessage[], prepared: PreparedTurn) {
  const settings = loadSettings();
  if (settings.activeProvider === "ollama") {
    return completeOllama(settings, prepared.system, messages);
  }
  const result = await generateText({
    model: activeModel(settings),
    system: prepared.system,
    messages,
    maxRetries: 0,
  });
  return result.text;
}

export interface ReviewFinding {
  quote: string;
  issue: string;
  source: string;
  suggestion: string;
}

export interface ReviewResult {
  summary: string;
  findings: ReviewFinding[];
  sources: PublicSource[];
  raw: string;
}

export async function reviewDocument(documentText: string): Promise<ReviewResult> {
  const prepared = prepareReview(documentText);
  const raw = await completeAnswer(
    [{ role: "user", content: `Review this process document and identify what does not align with Scrum.\n\n${documentText.length > 24000 ? documentText.slice(0, 24000) : documentText}` }],
    prepared,
  );
  const parsed = parseReview(raw);
  return { ...parsed, sources: prepared.sources, raw };
}

function parseReview(raw: string): { summary: string; findings: ReviewFinding[] } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) return { summary: raw.trim(), findings: [] };
  try {
    const value = JSON.parse(candidate.slice(start, end + 1)) as {
      summary?: unknown;
      findings?: unknown;
    };
    const findings = Array.isArray(value.findings)
      ? value.findings.map((item) => {
          const finding = item as Partial<ReviewFinding>;
          return {
            quote: String(finding.quote ?? ""),
            issue: String(finding.issue ?? ""),
            source: String(finding.source ?? ""),
            suggestion: String(finding.suggestion ?? ""),
          };
        })
      : [];
    return {
      summary: String(value.summary ?? "").trim() || raw.trim(),
      findings: findings.filter((finding) => finding.issue || finding.quote || finding.suggestion),
    };
  } catch {
    return { summary: raw.trim(), findings: [] };
  }
}

export async function testActiveProvider() {
  const settings = loadSettings();
  if (settings.activeProvider === "ollama") {
    const text = (await completeOllama(settings, "", [{ role: "user", content: "Reply with the single word ready." }])).trim();
    const processor = await ollamaProcessor(settings);
    if (processor === "gpu") return `${text} This model is using the GPU.`;
    if (processor === "mixed") return `${text} Part of this model is on the GPU, and the rest is on the CPU.`;
    if (processor === "cpu" && settings.providers.ollama.useGpu) {
      return `${text} This model is using the CPU. Ollama does not see a GPU.`;
    }
    if (processor === "cpu") return `${text} This model is using the CPU.`;
    return text;
  }
  const result = await generateText({
    model: activeModel(settings),
    prompt: "Reply with the single word ready.",
    maxOutputTokens: 32,
    maxRetries: 0,
  });
  return result.text.trim();
}
