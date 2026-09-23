// Local editing server: serves the site and lets the app save changes back
// to data/*.csv. The published GitHub Pages site has no server, so it is
// read-only; commit and push after editing to publish.
//
//   npm start            -> http://localhost:4321
//   PORT=8080 npm start

import { createServer } from "node:http";
import { readFile, writeFile, rename } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvObjects } from "./src/csv.js";
import { WANT_COLUMNS, COLLECTION_COLUMNS } from "./src/records.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 4321;
const HOST = process.env.HOST || "127.0.0.1";

const WRITABLE = {
  "wants.csv": WANT_COLUMNS,
  "collection.csv": COLLECTION_COLUMNS,
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

async function readBody(req, limit = 5_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function saveData(name, req, res) {
  const columns = WRITABLE[name];
  if (!columns) return send(res, 404, "Unknown data file");
  const text = await readBody(req);
  const parsed = parseCsvObjects(text);
  if (parsed.columns.join(",") !== columns.join(",")) {
    return send(res, 400, `Header must be ${columns.join(",")}`);
  }
  const target = join(ROOT, "data", name);
  const tmp = `${target}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, target);
  console.log(`saved data/${name} (${parsed.rows.length} rows)`);
  send(res, 200, JSON.stringify({ rows: parsed.rows.length }), TYPES[".json"]);
}

async function serveStatic(pathname, res) {
  const rel = normalize(decodeURIComponent(pathname === "/" ? "/index.html" : pathname)).replace(/^[/\\]+/, "");
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT) || rel.split(sep)[0] === "node_modules" || rel.startsWith(".")) {
    return send(res, 403, "Forbidden");
  }
  try {
    send(res, 200, await readFile(file), TYPES[extname(file)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found");
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    if (pathname === "/api/status") return send(res, 200, JSON.stringify({ editable: true }), TYPES[".json"]);
    const save = pathname.match(/^\/api\/data\/([\w.-]+)$/);
    if (save && req.method === "PUT") return await saveData(save[1], req, res);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
    return await serveStatic(pathname, res);
  } catch (err) {
    console.error(err);
    send(res, 500, err.message);
  }
}).listen(PORT, HOST, () => {
  console.log(`Vinyl hunt list: http://localhost:${PORT}  (edits save to data/*.csv)`);
});
