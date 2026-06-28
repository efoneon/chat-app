// Minimalist chat client: theme toggle, join flow, and WebSocket messaging.

(() => {
  'use strict';

  // ---- Theme ----
  const THEME_KEY = 'chat-theme';
  const root = document.documentElement;

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  // Restore saved theme, or follow the OS preference on first visit.
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  }

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  // ---- Elements ----
  const joinOverlay = document.getElementById('join-overlay');
  const joinForm = document.getElementById('join-form');
  const nameInput = document.getElementById('name-input');
  const messagesEl = document.getElementById('messages');
  const chatForm = document.getElementById('chat-form');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const presenceEl = document.getElementById('presence');

  let socket = null;
  let myName = null;

  // ---- Rendering ----
  function isNearBottom() {
    const threshold = 80;
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < threshold;
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function renderChat(msg) {
    const wrap = document.createElement('div');
    const self = msg.name === myName;
    wrap.className = 'msg ' + (self ? 'self' : 'other');

    if (!self) {
      const author = document.createElement('div');
      author.className = 'msg-author';
      author.textContent = msg.name;
      wrap.appendChild(author);
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.text; // textContent => no HTML injection
    wrap.appendChild(bubble);

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = formatTime(msg.ts);
    wrap.appendChild(time);

    messagesEl.appendChild(wrap);
  }

  function renderSystem(text) {
    const el = document.createElement('div');
    el.className = 'system';
    el.textContent = text;
    messagesEl.appendChild(el);
  }

  function renderMessage(msg) {
    const stick = isNearBottom();
    if (msg.type === 'chat') renderChat(msg);
    else if (msg.type === 'system') renderSystem(msg.text);
    if (stick) scrollToBottom();
  }

  function setPresence(count) {
    if (typeof count !== 'number') return;
    presenceEl.textContent = count === 1 ? '1 online' : `${count} online`;
  }

  // ---- WebSocket ----
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}`);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'join', name: myName }));
      messageInput.disabled = false;
      sendBtn.disabled = false;
      messageInput.focus();
    });

    socket.addEventListener('message', (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'presence') {
        setPresence(data.count);
      } else {
        renderMessage(data);
      }
    });

    socket.addEventListener('close', () => {
      messageInput.disabled = true;
      sendBtn.disabled = true;
      renderSystem('Disconnected. Reconnecting…');
      setTimeout(connect, 1500); // simple auto-reconnect
    });
  }

  // ---- Join flow ----
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    myName = name;
    joinOverlay.classList.add('hidden');
    connect();
  });

  // ---- Sending ----
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'chat', text }));
    messageInput.value = '';
    messageInput.focus();
  });
})();
