// Minimalist chat client: theme toggle, join flow, and WebSocket messaging.

(() => {
  'use strict';

  // ---- Theme ----
  const THEME_KEY = 'chat-theme';
  const root = document.documentElement;
  const themeIcon = document.getElementById('theme-icon');

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    // Show the icon for the mode you'll switch *to*: moon in light, sun in dark.
    themeIcon.src = theme === 'dark' ? 'img/light-mode.png' : 'img/dark-mode.png';
  }

  // Restore saved theme, or follow the OS preference on first visit.
  const saved = localStorage.getItem(THEME_KEY);
  let initialTheme = 'light';
  if (saved === 'light' || saved === 'dark') {
    initialTheme = saved;
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    initialTheme = 'dark';
  }
  applyTheme(initialTheme);

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
  const toolsBtn = document.getElementById('tools-btn');
  const toolsPanel = document.getElementById('tools-panel');
  const toolsMenu = document.getElementById('tools-menu');
  const toolsEmojis = document.getElementById('tools-emojis');
  const openEmojisBtn = document.getElementById('open-emojis-btn');
  const emojiBackBtn = document.getElementById('emoji-back-btn');
  const emojiGrid = document.getElementById('emoji-grid');
  const attachBtn = document.getElementById('attach-btn');
  const fileInput = document.getElementById('file-input');
  const attachPreview = document.getElementById('attach-preview');
  const attachPreviewMedia = attachPreview.querySelector('.attach-preview-media');
  const attachRemove = document.getElementById('attach-remove');

  let socket = null;
  let myName = null;
  // Media staged in the composer, sent on the next Send. null when none.
  let pendingAttachment = null; // { kind: 'image'|'video', data: dataURL }

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

  // Build the message wrapper (author label + timestamp) and append the given
  // bubble element. Shared by text and media messages.
  function renderBubble(msg, bubble) {
    const wrap = document.createElement('div');
    const self = msg.name === myName;
    wrap.className = 'msg ' + (self ? 'self' : 'other');

    if (!self) {
      const author = document.createElement('div');
      author.className = 'msg-author';
      author.textContent = msg.name;
      wrap.appendChild(author);
    }

    wrap.appendChild(bubble);

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = formatTime(msg.ts);
    wrap.appendChild(time);

    messagesEl.appendChild(wrap);
  }

  function renderChat(msg) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = msg.text; // textContent => no HTML injection
    renderBubble(msg, bubble);
  }

  function renderMedia(msg) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble media-bubble';

    let media;
    if (msg.kind === 'video') {
      media = document.createElement('video');
      media.src = msg.data;
      media.controls = true;
      media.preload = 'metadata';
    } else {
      media = document.createElement('img');
      media.src = msg.data;
      media.alt = msg.caption || 'image';
      media.loading = 'lazy';
    }
    media.className = 'media';
    // Re-stick to the bottom once the media's dimensions are known.
    media.addEventListener('load', () => { if (isNearBottom()) scrollToBottom(); });
    media.addEventListener('loadeddata', () => { if (isNearBottom()) scrollToBottom(); });
    bubble.appendChild(media);

    if (msg.caption) {
      const cap = document.createElement('div');
      cap.className = 'media-caption';
      cap.textContent = msg.caption; // textContent => no HTML injection
      bubble.appendChild(cap);
    }

    renderBubble(msg, bubble);
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
    else if (msg.type === 'media') renderMedia(msg);
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
      toolsBtn.disabled = false;
      updateSendState();
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
      toolsBtn.disabled = true;
      closeTools();
      renderSystem('Disconnected. Reconnecting…');
      setTimeout(connect, 1500); // simple auto-reconnect
    });
  }

  // ---- Tools panel (emoji) ----
  const EMOJIS = [
    '😀', '😄', '😁', '😆', '😅', '😂', '🙂', '😉',
    '😊', '😍', '😘', '😎', '🤔', '😴', '😭', '😡',
    '👍', '👎', '👏', '🙌', '🙏', '💪', '👋', '🤝',
    '❤️', '🔥', '✨', '🎉', '💯', '👀', '🚀', '☕',
  ];

  // Build the emoji grid once.
  for (const emoji of EMOJIS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-btn';
    btn.textContent = emoji;
    btn.setAttribute('aria-label', `Insert ${emoji}`);
    btn.addEventListener('click', () => insertAtCursor(emoji));
    emojiGrid.appendChild(btn);
  }

  // Switch between the menu view and the emoji view inside the panel.
  function showToolsMenu() {
    toolsMenu.classList.remove('hidden');
    toolsEmojis.classList.add('hidden');
  }

  function showToolsEmojis() {
    toolsMenu.classList.add('hidden');
    toolsEmojis.classList.remove('hidden');
  }

  function openTools() {
    showToolsMenu(); // always open on the menu view
    toolsPanel.classList.remove('hidden');
    toolsBtn.setAttribute('aria-expanded', 'true');
  }

  function closeTools() {
    toolsPanel.classList.add('hidden');
    toolsBtn.setAttribute('aria-expanded', 'false');
  }

  function toggleTools() {
    if (toolsPanel.classList.contains('hidden')) openTools();
    else closeTools();
  }

  openEmojisBtn.addEventListener('click', showToolsEmojis);
  emojiBackBtn.addEventListener('click', showToolsMenu);

  // ---- Attachments (image / video) ----
  // Keep in sync with the server's MAX_MEDIA_CHARS (~5 MB raw ≈ 6.8 MB base64).
  const MAX_FILE_BYTES = 5 * 1024 * 1024;

  attachBtn.addEventListener('click', () => {
    closeTools();
    fileInput.click(); // open the native file picker
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = ''; // reset so picking the same file again still fires
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      renderSystem('Only image or video files can be attached.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      renderSystem('That file is too large (max 5 MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      // Stage the attachment in the composer; it is sent on the next Send.
      stageAttachment({ kind: isVideo ? 'video' : 'image', data: reader.result });
    };
    reader.onerror = () => renderSystem('Could not read that file.');
    reader.readAsDataURL(file);
  });

  // Show the staged attachment as a preview above the input.
  function stageAttachment(att) {
    pendingAttachment = att;
    attachPreviewMedia.innerHTML = '';
    let el;
    if (att.kind === 'video') {
      el = document.createElement('video');
      el.src = att.data;
      el.muted = true;
    } else {
      el = document.createElement('img');
      el.src = att.data;
      el.alt = 'attachment preview';
    }
    attachPreviewMedia.appendChild(el);
    attachPreview.classList.remove('hidden');
    updateSendState();
    messageInput.focus();
  }

  function clearAttachment() {
    pendingAttachment = null;
    attachPreviewMedia.innerHTML = '';
    attachPreview.classList.add('hidden');
    updateSendState();
  }

  attachRemove.addEventListener('click', clearAttachment);

  // Insert text at the input's caret, respecting maxlength, and keep focus.
  function insertAtCursor(text) {
    const start = messageInput.selectionStart ?? messageInput.value.length;
    const end = messageInput.selectionEnd ?? messageInput.value.length;
    const before = messageInput.value.slice(0, start);
    const after = messageInput.value.slice(end);
    const max = messageInput.maxLength;
    let next = before + text + after;
    if (max > 0 && next.length > max) next = next.slice(0, max);
    messageInput.value = next;
    const caret = Math.min(before.length + text.length, messageInput.value.length);
    messageInput.focus();
    messageInput.setSelectionRange(caret, caret);
  }

  toolsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTools();
  });

  // Close on outside click or Escape.
  document.addEventListener('click', (e) => {
    if (toolsPanel.classList.contains('hidden')) return;
    if (!toolsPanel.contains(e.target) && e.target !== toolsBtn) closeTools();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTools();
  });

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
  // Send is allowed when there's text OR a staged attachment.
  function updateSendState() {
    const hasText = messageInput.value.trim().length > 0;
    const connected = socket && socket.readyState === WebSocket.OPEN;
    sendBtn.disabled = !connected || (!hasText && !pendingAttachment);
  }
  messageInput.addEventListener('input', updateSendState);

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const text = messageInput.value.trim();

    if (pendingAttachment) {
      // Send media with the typed text as an optional caption.
      socket.send(JSON.stringify({
        type: 'media',
        kind: pendingAttachment.kind,
        data: pendingAttachment.data,
        caption: text,
      }));
      clearAttachment();
    } else if (text) {
      socket.send(JSON.stringify({ type: 'chat', text }));
    } else {
      return; // nothing to send
    }

    messageInput.value = '';
    messageInput.focus();
    updateSendState();
  });
})();
