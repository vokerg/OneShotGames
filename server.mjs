import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.join(repositoryRoot, "01-balti-city-walk");
const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const host = process.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function openBrowser(url) {
  if (process.env.NO_OPEN === "1") return;

  const command =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];

  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", () => {});
  child.unref();
}

async function resolveFile(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const requested = decodedPath === "/" ? "/index.html" : decodedPath;
  const candidate = path.resolve(gameRoot, `.${requested}`);
  const rootPrefix = `${gameRoot}${path.sep}`;

  if (candidate !== gameRoot && !candidate.startsWith(rootPrefix)) return null;

  const candidateStats = await stat(candidate);
  return candidateStats.isDirectory() ? path.join(candidate, "index.html") : candidate;
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
    const filePath = await resolveFile(requestUrl.pathname);

    if (!filePath) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    const body = await readFile(filePath);
    const contentType = contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": contentType,
    });

    if (request.method === "HEAD") response.end();
    else response.end(body);
  } catch (error) {
    const status = error?.code === "ENOENT" || error?.code === "ENOTDIR" ? 404 : 500;
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(status === 404 ? "Not found" : "Server error");

    if (status === 500) console.error(error);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Run with another port, for example: PORT=8081 npm start`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}`;
  console.log(`Bălți City Walk is running at ${url}`);
  console.log("Press Ctrl+C to stop.");
  openBrowser(url);
});
