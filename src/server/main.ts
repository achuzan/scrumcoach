import { createServer, type ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { getRequestListener } from "@hono/node-server";
import { createServer as createViteServer } from "vite";
import { app } from "./app.js";
import { rebuildIndex } from "./knowledge.js";
import { HOST, PORT, rootDir } from "./paths.js";

const dev = process.argv.includes("--dev");
const listener = getRequestListener(app.fetch);

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function serveStatic(urlPath: string, res: ServerResponse) {
  const dist = path.join(rootDir, "dist");
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(dist, requested));
  if (!filePath.startsWith(dist)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  const target = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(dist, "index.html");
  if (!fs.existsSync(target)) {
    res.statusCode = 404;
    res.end("The UI is not built. Run npm run build, or use npm run dev.");
    return;
  }
  res.setHeader("content-type", mime[path.extname(target)] ?? "application/octet-stream");
  fs.createReadStream(target).pipe(res);
}

rebuildIndex();

const vite = dev
  ? await createViteServer({
      root: rootDir,
      configFile: path.join(rootDir, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    })
  : null;

const server = createServer((req, res) => {
  const urlPath = (req.url ?? "/").split("?")[0] ?? "/";
  if (urlPath.startsWith("/api") || urlPath.startsWith("/v1") || urlPath === "/mcp" || urlPath.startsWith("/mcp/")) {
    listener(req, res);
    return;
  }
  if (vite) {
    vite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end("Not found");
    });
    return;
  }
  serveStatic(urlPath, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Scrum Coach is at http://${HOST}:${PORT}`);
});
