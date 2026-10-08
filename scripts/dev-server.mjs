#!/usr/bin/env node
// Usage: npm run dev   (PORT=8137 by default)
// Serves app/ and backs the page's test link:
//   WS   /link?client=<name>  a page sends {status, shot?} and receives commands
//   POST /cmd                 send a command to every connected page,
//                             e.g. {"type":"key","key":"right"}; {"type":"dump"}
//                             writes the page's preset data to dump-<client>.json
// What pages send is written to .dev/ (status-<client>.json, shot-*.png|jpg).
// The link is a WebSocket because the TV's browser sends no plain HTTP
// requests from a packaged app's page, while WebSockets work.
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, readFile, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "app");
const outDir = join(root, ".dev");
const port = Number(process.env.PORT || 8137);
const MAX_MESSAGE = 8 * 1024 * 1024;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".md": "text/plain" };

mkdirSync(outDir, { recursive: true });
const links = new Set(); // connected pages: { socket, client }
let shots = 0;

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function report(client, body) {
  const status = Object.assign(
    { receivedAt: new Date().toISOString() },
    body.status,
    body.shotError ? { shotError: body.shotError } : {}
  );
  writeFileSync(join(outDir, `status-${client}.json`), JSON.stringify(status, null, 2) + "\n");
  if (body.dump) writeFileSync(join(outDir, `dump-${client}.json`), JSON.stringify(body.dump, null, 2) + "\n");
  const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(body.shot || "");
  if (match) {
    const name = `shot-${client}-${String(++shots).padStart(3, "0")}.${match[1] === "png" ? "png" : "jpg"}`;
    writeFileSync(join(outDir, name), Buffer.from(match[2], "base64"));
    console.log(`snapshot ${name}`);
  }
}

// One unmasked WebSocket frame, as a server sends them.
function frame(opcode, payload) {
  const n = payload.length;
  let head;
  if (n < 126) head = Buffer.from([0x80 | opcode, n]);
  else if (n < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(n, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, payload]);
}

// Reads the frames a browser sends (always masked), joining fragments, and
// calls onText for each complete text message.
function reader(socket, onText) {
  let buffer = Buffer.alloc(0);
  let parts = [];
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 2) return;
      const fin = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;
      let length = buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      if (length > MAX_MESSAGE) return socket.destroy();
      const masked = (buffer[1] & 0x80) !== 0;
      const start = offset + (masked ? 4 : 0);
      if (buffer.length < start + length) return;
      const payload = Buffer.from(buffer.subarray(start, start + length));
      if (masked) for (let i = 0; i < length; i++) payload[i] ^= buffer[offset + (i & 3)];
      buffer = buffer.subarray(start + length);

      if (opcode === 8) return socket.end(frame(8, Buffer.alloc(0)));
      if (opcode === 9) socket.write(frame(10, payload));
      else if (opcode === 0 || opcode === 1) {
        parts.push(payload);
        if (fin) {
          onText(Buffer.concat(parts).toString("utf8"));
          parts = [];
        }
      }
    }
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/cmd" && req.method === "POST") {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      let command;
      try {
        command = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch (e) {
        return send(res, 400, '{"error":"not JSON"}');
      }
      const text = Buffer.from(JSON.stringify(command));
      for (const link of links) link.socket.write(frame(1, text));
      send(res, 200, JSON.stringify({ sentTo: Array.from(links, (link) => link.client) }));
    });
    return;
  }
  const file = normalize(join(appDir, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
  if (file !== appDir && !file.startsWith(appDir + sep)) return send(res, 403, "forbidden", "text/plain");
  readFile(file, (error, data) => {
    if (error) send(res, 404, "not found", "text/plain");
    else send(res, 200, data, TYPES[extname(file)] || "application/octet-stream");
  });
});

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, "http://localhost");
  const key = req.headers["sec-websocket-key"];
  if (url.pathname !== "/link" || !key) return socket.destroy();
  const client = String(url.searchParams.get("client") || "page").replace(/[^a-z0-9-]/gi, "");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${createHash("sha1").update(key + WS_GUID).digest("base64")}\r\n\r\n`
  );
  const link = { socket, client };
  links.add(link);
  console.log(`linked: ${client} from ${socket.remoteAddress}`);
  reader(socket, (text) => {
    try {
      report(client, JSON.parse(text));
    } catch (e) {
      console.log(`unreadable message from ${client}`);
    }
  });
  const gone = () => {
    if (links.delete(link)) console.log(`unlinked: ${client}`);
  };
  socket.on("close", gone);
  socket.on("error", gone);
});

server.listen(port, () => {
  const lan = Object.values(networkInterfaces()).flat().find((n) => n && n.family === "IPv4" && !n.internal);
  console.log(`serving app/ at http://${lan ? lan.address : "localhost"}:${port}/`);
});
