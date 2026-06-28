// Minimalist real-time chat server.
// Serves the static frontend and runs a WebSocket hub that broadcasts
// every message to all connected clients.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// --- Static file server ---------------------------------------------------

const httpServer = createServer(async (req, res) => {
  try {
    // Resolve the request path, defaulting to index.html, and guard against
    // directory traversal by keeping everything inside PUBLIC_DIR.
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const filePath = normalize(join(PUBLIC_DIR, relPath));

    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const data = await readFile(filePath);
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not Found');
  }
});

// --- WebSocket chat hub ---------------------------------------------------

const wss = new WebSocketServer({ server: httpServer });

// No message history is kept: a newly joined client only sees messages and
// join/leave notices that occur after they connect.
const clients = new Map(); // ws -> { name }

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

// Strip ASCII control characters, then trim and cap length. Done by code point
// so there are no literal control characters in this source file.
function sanitize(str, maxLen) {
  const cleaned = String(str ?? '')
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('');
  return cleaned.trim().slice(0, maxLen);
}

wss.on('connection', (ws) => {
  clients.set(ws, { name: null });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const client = clients.get(ws);
    if (!client) return;

    if (msg.type === 'join') {
      const name = sanitize(msg.name, 32) || 'Anonymous';
      client.name = name;
      const event = { type: 'system', text: `${name} joined the chat`, ts: Date.now() };
      broadcast(event);
      broadcast({ type: 'presence', count: countNamed() });
      return;
    }

    if (msg.type === 'chat') {
      if (!client.name) return; // must join first
      const text = sanitize(msg.text, 2000);
      if (!text) return;
      const event = {
        type: 'chat',
        name: client.name,
        text,
        ts: Date.now(),
      };
      broadcast(event);
    }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    clients.delete(ws);
    if (client?.name) {
      const event = { type: 'system', text: `${client.name} left the chat`, ts: Date.now() };
      broadcast(event);
      broadcast({ type: 'presence', count: countNamed() });
    }
  });
});

function countNamed() {
  let n = 0;
  for (const c of clients.values()) if (c.name) n++;
  return n;
}

httpServer.listen(PORT, () => {
  console.log(`Chat app running at http://localhost:${PORT}`);
});
