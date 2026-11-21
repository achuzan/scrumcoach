import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { rebuildIndex } from "./knowledge.js";
import { createScrumMcpServer } from "./mcp.js";

rebuildIndex();
const server = createScrumMcpServer();
await server.connect(new StdioServerTransport());
