// Local preview of the site, view-only like the published one. The lists
// change only through data/*.csv in the GitHub repo.
//
//   npm start            -> http://localhost:4321
//   PORT=8080 npm start

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 4321;
const HOST = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, body, type = TYPES[".txt"]) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

// Same value the publish workflow writes to data/updated.txt.
async function lastDataCommit() {
  const { stdout } = await promisify(execFile)("git", ["log", "-1", "--format=%cI", "--", "data"], { cwd: ROOT });
  return stdout.trim();
}

createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "View-only");
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname === "/data/updated.txt") {
    return send(res, 200, await lastDataCommit().catch(() => ""));
  }
  const rel = normalize(decodeURIComponent(pathname === "/" ? "/index.html" : pathname)).replace(/^[/\\]+/, "");
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT) || rel.split(sep).some((part) => part.startsWith(".") || part === "node_modules")) {
    return send(res, 403, "Forbidden");
  }
  try {
    send(res, 200, await readFile(file), TYPES[extname(file)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found");
  }
}).listen(PORT, HOST, () => {
  console.log(`Vinyl hunt list preview: http://localhost:${PORT}`);
});
