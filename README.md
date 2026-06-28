# Chat

A minimalist real-time chat app. Anyone who opens the app can chat with everyone
else, with a light/dark mode toggle.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000 in your browser. Open it in another tab (or on
another device on your network) to chat with yourself or others.

For live-reload during development:

```bash
npm run dev
```

## How it works

- **`server.js`** — a Node HTTP server that serves the frontend and runs a
  WebSocket hub. Every chat message is broadcast to all connected clients. The
  last 50 messages are kept in memory so new joiners see recent context.
- **`public/`** — the frontend (vanilla HTML/CSS/JS, no build step).
  - `index.html` — markup and the name-prompt overlay.
  - `styles.css` — theming via CSS variables; light and dark palettes.
  - `app.js` — theme toggle, join flow, and WebSocket messaging.

Messages are rendered with `textContent`, so user input can't inject HTML.

## Notes & future ideas

- Message history is in-memory only and resets when the server restarts.
- Possible next features: persistent storage, chat rooms/channels, typing
  indicators, message editing, user accounts, and image/file sharing.

## Config

- `PORT` — server port (defaults to `3000`).
