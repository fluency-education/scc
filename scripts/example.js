// Serves the repository so examples/index.html can import the compiled build,
// which browsers refuse to do for pages opened from disk.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// Without a PORT, the first free port from 5173 up, as another dev server may have it.
const PORT = Number(process.env.PORT ?? 5173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const server = createServer((request, response) => {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  const path = normalize(join(ROOT, decodeURIComponent(pathname)));
  const file = pathname.endsWith("/") ? join(path, "index.html") : path;
  // Only files inside the repository, and only ones that exist.
  if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});
let port = PORT;
server.on("error", (error) => {
  if (error.code !== "EADDRINUSE" || process.env.PORT || port >= PORT + 20) throw error;
  server.listen(++port);
});
server.on("listening", () => console.log(`Examples at http://localhost:${port}/examples/`));
server.listen(port);
