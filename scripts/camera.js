// Local camera page for photographing records into inbox/, so Claude Code on
// this computer can identify them ("add the records in my inbox").
//
//   npm run camera        -> http://localhost:4322 (opens in your browser)
//
// Only listens on this computer (127.0.0.1) and is never part of the
// published site. Photos stay in inbox/, which git ignores.

import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INBOX = new URL("../inbox/", import.meta.url);
const PAGE = new URL("../tools/camera.html", import.meta.url);
const PORT = Number(process.env.PORT) || 4322;
const MAX_BYTES = 15_000_000;

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw Object.assign(new Error("Photo too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// 2026-09-29_21-04-07-123.jpg: sortable, and never taken from the request.
function photoName() {
  return new Date().toISOString().replace("T", "_").replace(/:/g, "-").replace(".", "-").replace("Z", "") + ".jpg";
}

async function inboxPhotos() {
  try {
    return (await readdir(INBOX)).filter((f) => f.endsWith(".jpg")).sort();
  } catch {
    return [];
  }
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    if (req.method === "GET" && pathname === "/") {
      return send(res, 200, await readFile(PAGE), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && pathname === "/inbox") {
      return send(res, 200, JSON.stringify(await inboxPhotos()), "application/json");
    }
    if (req.method === "POST" && pathname === "/snap") {
      if (req.headers["content-type"] !== "image/jpeg") return send(res, 415, "Expected image/jpeg");
      const photo = await readBody(req);
      if (photo[0] !== 0xff || photo[1] !== 0xd8) return send(res, 400, "Not a JPEG");
      await mkdir(INBOX, { recursive: true });
      const name = photoName();
      await writeFile(new URL(name, INBOX), photo);
      console.log(`saved inbox/${name}`);
      return send(res, 200, JSON.stringify({ name }), "application/json");
    }
    send(res, 404, "Not found");
  } catch (err) {
    send(res, err.status || 500, err.message);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Camera: ${url}  (photos go to ${ROOT}inbox)`);
  console.log('When you\'re done, tell Claude Code: "add the records in my inbox".');
  if (process.env.NO_OPEN) return;
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  execFile(cmd, args, () => {});
});
