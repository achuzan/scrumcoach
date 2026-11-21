import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { completeAnswer, prepareAnswer, reviewDocument } from "./coach.js";
import { createGuidance } from "./guidance.js";
import { bearerStatus, errorMessage } from "./http.js";
import { searchKnowledge } from "./knowledge.js";
import { explainModelError, loadSettings } from "./settings.js";

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    isError,
  };
}

export function createScrumMcpServer() {
  const server = new McpServer({ name: "scrum-coach", version: "0.1.0" });

  server.registerTool(
    "ask_scrum",
    {
      title: "Ask Scrum Coach",
      description:
        "Judge a question or a situation with the 2020 Scrum Guide, the Scrum Guide Expansion Pack, and the user's guidance notes. Scrum Coach's configured model writes the answer.",
      inputSchema: {
        question: z.string().describe("The question or situation."),
      },
    },
    async ({ question }) => {
      try {
        const prepared = prepareAnswer(question);
        const answer = await completeAnswer([{ role: "user", content: question }], prepared);
        const sources = prepared.sources.map((source) => `- ${source.label}: ${source.heading}`).join("\n");
        return textResult(`${answer}\n\nSources consulted:\n${sources || "- none"}`);
      } catch (error) {
        return textResult(explainModelError(error, loadSettings()), true);
      }
    },
  );

  server.registerTool(
    "review_document",
    {
      title: "Review a document against Scrum",
      description:
        "Read process or procedure text and report what does not align with the Scrum Guide, the Expansion Pack, and the user's guidance.",
      inputSchema: {
        text: z.string().describe("The document text to review."),
      },
    },
    async ({ text }) => {
      try {
        const review = await reviewDocument(text);
        const findings = review.findings
          .map(
            (finding, index) =>
              `${index + 1}. ${finding.issue}\nQuote: ${finding.quote}\nSource: ${finding.source}\nSuggestion: ${finding.suggestion}`,
          )
          .join("\n\n");
        return textResult(`${review.summary}\n\n${findings || "No misalignments were reported."}`);
      } catch (error) {
        return textResult(explainModelError(error, loadSettings()), true);
      }
    },
  );

  server.registerTool(
    "search_knowledge",
    {
      title: "Search Scrum knowledge",
      description:
        "Return matching passages from user guidance, the 2020 Scrum Guide, and the Expansion Pack. This does not call a model.",
      inputSchema: {
        query: z.string().describe("Words or a question to search for."),
      },
    },
    async ({ query }) => {
      const chunks = searchKnowledge(query, 8);
      if (chunks.length === 0) return textResult("No passages matched.");
      const text = chunks
        .map((chunk) => `## ${chunk.label} — ${chunk.heading}\nAuthority ${chunk.authority}\n\n${chunk.text}`)
        .join("\n\n");
      return textResult(text);
    },
  );

  server.registerTool(
    "save_guidance",
    {
      title: "Save Scrum guidance",
      description:
        "Store a clarification or a local decision. Saved notes outrank the Scrum Guide and the Expansion Pack on later answers.",
      inputSchema: {
        title: z.string().describe("Short title for the note."),
        body: z.string().describe("The guidance the coach should follow."),
      },
    },
    async ({ title, body }) => {
      try {
        const note = createGuidance({ title, body, source: "chat" });
        return textResult(`Saved guidance “${note.title}”. Later answers will follow it when it applies.`);
      } catch (error) {
        return textResult(errorMessage(error), true);
      }
    },
  );

  return server;
}

export async function handleMcpRequest(request: Request) {
  const denied = bearerStatus(request);
  if (denied) return denied;
  const server = createScrumMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
