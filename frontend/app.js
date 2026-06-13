/* ============================================================
   arXiv Curator — Chat UI logic
   Talks to the FastAPI backend on the same origin.
   ============================================================ */

// API base. Empty string = same origin (served by FastAPI at /).
// Override by setting window.ARXIV_API_BASE before this script loads.
const API = (typeof window.ARXIV_API_BASE === "string")
  ? window.ARXIV_API_BASE
  : "";

// ── Mode configuration ───────────────────────────────────────
// rag    -> /api/v1/stream      (token streaming)
// hybrid -> /api/v1/hybrid-search/ (single response, search hits)
// agent  -> /api/v1/ask-agentic (single response, reasoning steps)
const MODES = {
  rag:    { label: "RAG Ask",  endpoint: "/api/v1/stream",         streaming: true  },
  hybrid: { label: "Hybrid",   endpoint: "/api/v1/hybrid-search/", streaming: false },
  agent:  { label: "Agentic",  endpoint: "/api/v1/ask-agentic",    streaming: false },
};

// ── State ─────────────────────────────────────────────────────
let currentMode   = "rag";
let isBusy        = false;
let chatHistory   = [];
let allSessions   = loadSessions();
let activeSession = null;

// ── Boot ──────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  checkHealth();
  renderSessionList();
  updateModeBadge();

  const input = document.getElementById("chatInput");
  input.addEventListener("input", () => {
    document.getElementById("sendBtn").disabled = !input.value.trim() || isBusy;
  });
});

// ── Sessions (localStorage) ───────────────────────────────────
function loadSessions() {
  try { return JSON.parse(localStorage.getItem("arxiv_sessions") || "[]"); }
  catch { return []; }
}

function saveSession() {
  if (!chatHistory.length) return;
  const first = chatHistory[0].content;
  const title = first.slice(0, 48) + (first.length > 48 ? "…" : "");

  if (activeSession === null) {
    activeSession = Date.now();
    allSessions.unshift({ id: activeSession, title, messages: [...chatHistory] });
  } else {
    const idx = allSessions.findIndex(s => s.id === activeSession);
    if (idx > -1) allSessions[idx].messages = [...chatHistory];
  }
  allSessions = allSessions.slice(0, 30);
  try { localStorage.setItem("arxiv_sessions", JSON.stringify(allSessions)); }
  catch { /* storage full or blocked — ignore */ }
  renderSessionList();
}

function renderSessionList() {
  const list = document.getElementById("chatList");
  list.innerHTML = "";

  if (!allSessions.length) {
    list.innerHTML = '<div class="empty-history">No conversations yet.<br>Start by asking a question.</div>';
    return;
  }

  allSessions.forEach(s => {
    const div = document.createElement("div");
    div.className = "chat-item" + (s.id === activeSession ? " active" : "");
    div.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      escapeHtml(s.title);
    div.onclick = () => loadSession(s.id);
    list.appendChild(div);
  });
}

function loadSession(id) {
  const s = allSessions.find(x => x.id === id);
  if (!s) return;
  activeSession = id;
  chatHistory   = [...s.messages];

  const wrap = document.getElementById("messagesWrap");
  wrap.innerHTML = "";
  document.getElementById("topbarTitle").textContent = s.title;

  chatHistory.forEach(m => {
    if (m.role === "user")            appendUserBubble(m.content);
    else if (m.role === "assistant")  appendAiBubble(m.content, m.sources || [], m.reasoning || []);
  });

  renderSessionList();
  closeSidebar();
  scrollBottom();
}

function newChat() {
  activeSession = null;
  chatHistory   = [];
  document.getElementById("messagesWrap").innerHTML = buildEmptyStateHtml();
  document.getElementById("topbarTitle").textContent = "New conversation";
  renderSessionList();
  closeSidebar();
}

function clearChat() { newChat(); }

// ── Health check ──────────────────────────────────────────────
async function checkHealth() {
  const dot  = document.getElementById("statusDot");
  const text = document.getElementById("statusText");
  try {
    const r = await fetch(`${API}/api/v1/health`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error();
    dot.className = "status-dot online";
    text.textContent = "API online";
  } catch {
    dot.className = "status-dot offline";
    text.textContent = "API offline";
  }
  setTimeout(checkHealth, 30000);
}

// ── Mode switching ────────────────────────────────────────────
function setMode(m) {
  currentMode = m;
  ["rag", "hybrid", "agent"].forEach(k => {
    const btn = document.getElementById("mode" + k.charAt(0).toUpperCase() + k.slice(1));
    if (btn) btn.classList.toggle("active", k === m);
  });
  updateModeBadge();
}

function updateModeBadge() {
  const cfg = MODES[currentMode];
  const tail = cfg.streaming ? "· Streaming" : "· Single response";
  document.getElementById("modeBadge").textContent = cfg.label;

  const globeSvg =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>';
  document.getElementById("inputModeBadge").innerHTML = `${globeSvg} ${cfg.label} ${tail}`;
}

// ── Input helpers ─────────────────────────────────────────────
function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function useSuggestion(btn) {
  const input = document.getElementById("chatInput");
  input.value = btn.querySelector(".s-text").textContent;
  autoResize(input);
  document.getElementById("sendBtn").disabled = false;
  input.focus();
}

// ── Sidebar (mobile) ──────────────────────────────────────────
function openSidebar() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("overlay").classList.add("show");
}
function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("overlay").classList.remove("show");
}

// ── Render helpers ────────────────────────────────────────────
function scrollBottom() {
  const wrap = document.getElementById("messagesWrap");
  wrap.scrollTop = wrap.scrollHeight;
}

function escapeHtml(t) {
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function simpleMarkdown(text) {
  let t = escapeHtml(text);
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");   // bold
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");           // inline code

  // Group consecutive bullet lines into a single <ul>
  const lines = t.split("\n");
  const out = [];
  let buf = [];
  let inList = false;
  const flushList = () => {
    if (buf.length) { out.push("<ul>" + buf.join("") + "</ul>"); buf = []; }
    inList = false;
  };
  for (const ln of lines) {
    const m = ln.match(/^\s*[-*]\s+(.+)$/);
    if (m) { buf.push(`<li>${m[1]}</li>`); inList = true; }
    else   { flushList(); out.push(ln); }
  }
  flushList();
  t = out.join("\n");

  // Paragraphs (skip blocks that are already lists)
  return t.split(/\n{2,}/).map(p => {
    if (p.trim().startsWith("<ul>")) return p;
    return `<p>${p.replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function aiAvatarSvg() {
  return '<div class="avatar ai"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>';
}

function sourcesHtml(sources) {
  if (!sources || !sources.length) return "";
  const tags = sources.map(s => {
    // sources are plain URL strings from the API
    const url = typeof s === "string" ? s : (s.url || s.pdf_url || "#");
    const label = typeof s === "string"
      ? (url.split("/").pop() || "Source").replace(".pdf", "")
      : (s.title || s.arxiv_id || "Source");
    return `<a class="source-tag" href="${url}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
      ${escapeHtml(label)}</a>`;
  }).join("");
  return `<div class="sources-wrap">${tags}</div>`;
}

function reasoningHtml(steps) {
  if (!steps || !steps.length) return "";
  const items = steps.map(s => `<li>${escapeHtml(s)}</li>`).join("");
  return `<div class="reasoning">
    <div class="reasoning-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.663 17h4.673M12 3v1M12 20v1M4 12H3M21 12h-1"/><circle cx="12" cy="12" r="5"/></svg>
      Agent reasoning
    </div>
    <ol>${items}</ol>
  </div>`;
}

function buildEmptyStateHtml() {
  return `
  <div class="empty-state" id="emptyState">
    <div class="empty-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </div>
    <div class="empty-title">Ask about any AI paper</div>
    <div class="empty-sub">Search ingested arXiv papers with hybrid retrieval. The agent validates, retrieves, grades, and rewrites queries when needed.</div>
    <div class="suggestion-grid">
      <button class="suggestion-card" onclick="useSuggestion(this)"><div class="s-label">Trending topic</div><div class="s-text">What are the latest advances in reasoning with LLMs?</div></button>
      <button class="suggestion-card" onclick="useSuggestion(this)"><div class="s-label">Architecture</div><div class="s-text">Explain the Transformer attention mechanism from recent papers</div></button>
      <button class="suggestion-card" onclick="useSuggestion(this)"><div class="s-label">Comparison</div><div class="s-text">How do RLHF and DPO compare for aligning language models?</div></button>
      <button class="suggestion-card" onclick="useSuggestion(this)"><div class="s-label">Deep dive</div><div class="s-text">Summarise recent work on mixture-of-experts scaling</div></button>
    </div>
  </div>`;
}

function appendUserBubble(text) {
  document.getElementById("emptyState")?.remove();
  const row = document.createElement("div");
  row.className = "message-row user";
  row.innerHTML = `
    <div class="avatar user"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
    <div class="bubble-wrap">
      <div class="bubble user">${escapeHtml(text)}</div>
      <div class="msg-meta">${formatTime(new Date())}</div>
    </div>`;
  document.getElementById("messagesWrap").appendChild(row);
  scrollBottom();
}

function appendAiBubble(text, sources = [], reasoning = []) {
  const row = document.createElement("div");
  row.className = "message-row";
  row.innerHTML = `
    ${aiAvatarSvg()}
    <div class="bubble-wrap">
      ${reasoningHtml(reasoning)}
      <div class="bubble ai">${simpleMarkdown(text)}</div>
      ${sourcesHtml(sources)}
      <div class="msg-meta">${formatTime(new Date())}</div>
    </div>`;
  document.getElementById("messagesWrap").appendChild(row);
  scrollBottom();
}

function appendThinking() {
  const row = document.createElement("div");
  row.className = "message-row";
  row.id = "thinkingRow";
  row.innerHTML = `${aiAvatarSvg()}
    <div class="bubble-wrap">
      <div class="thinking"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span></div>
    </div>`;
  document.getElementById("messagesWrap").appendChild(row);
  scrollBottom();
}

function removeThinking() { document.getElementById("thinkingRow")?.remove(); }

// ── Send ──────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById("chatInput");
  const query = input.value.trim();
  if (!query || isBusy) return;

  input.value = "";
  input.style.height = "auto";
  document.getElementById("sendBtn").disabled = true;
  isBusy = true;

  chatHistory.push({ role: "user", content: query });
  appendUserBubble(query);
  appendThinking();

  // Set title from first user message
  if (chatHistory.filter(m => m.role === "user").length === 1) {
    document.getElementById("topbarTitle").textContent =
      query.length > 40 ? query.slice(0, 40) + "…" : query;
  }

  const cfg = MODES[currentMode];
  try {
    if (cfg.streaming) await handleStreaming(query, cfg.endpoint);
    else               await handleSingle(query, cfg);
  } catch (err) {
    removeThinking();
    appendAiBubble("The request could not be completed. Make sure the backend is running and reachable, then try again.");
  }

  isBusy = false;
  document.getElementById("sendBtn").disabled = !input.value.trim();
  saveSession();
}

// ── Streaming handler (/api/v1/stream) ────────────────────────
// Server sends lines: `data: {json}\n\n`
//   metadata:  {sources, chunks_used, search_mode}
//   token:     {chunk: "text"}
//   complete:  {answer: "full", done: true}
async function handleStreaming(query, endpoint) {
  const resp = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: 3, use_hybrid: true }),
  });
  if (!resp.ok || !resp.body) throw new Error(resp.statusText);

  removeThinking();

  // Build streaming bubble
  const row = document.createElement("div");
  row.className = "message-row";
  row.innerHTML = `${aiAvatarSvg()}
    <div class="bubble-wrap">
      <div class="bubble ai" data-stream="1"><span class="cursor"></span></div>
      <div class="msg-meta">${formatTime(new Date())}</div>
    </div>`;
  document.getElementById("messagesWrap").appendChild(row);
  const bubble  = row.querySelector('[data-stream="1"]');
  const wrapEl  = row.querySelector(".bubble-wrap");
  const metaEl  = row.querySelector(".msg-meta");

  let fullText = "";
  let sources  = [];
  let buffer   = "";

  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";   // keep incomplete event in buffer

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;

      try {
        const data = JSON.parse(raw);
        if (Array.isArray(data.sources)) sources = data.sources;
        if (data.chunk) {
          fullText += data.chunk;
          bubble.innerHTML = simpleMarkdown(fullText) + '<span class="cursor"></span>';
          scrollBottom();
        }
        if (data.done) {
          if (data.answer) fullText = data.answer;
        }
        if (data.error) {
          fullText += `\n\n_Error: ${data.error}_`;
        }
      } catch {
        // Non-JSON line — append raw text
        fullText += raw;
        bubble.innerHTML = simpleMarkdown(fullText) + '<span class="cursor"></span>';
      }
    }
  }

  // Finalise
  bubble.innerHTML = simpleMarkdown(fullText);
  if (sources.length) {
    const sw = document.createElement("div");
    sw.innerHTML = sourcesHtml(sources);
    wrapEl.insertBefore(sw.firstElementChild, metaEl);
  }

  chatHistory.push({ role: "assistant", content: fullText, sources });
  scrollBottom();
}

// ── Single-response handler (hybrid / agentic) ────────────────
async function handleSingle(query, cfg) {
  let body;
  if (currentMode === "hybrid") {
    body = { query, size: 5, use_hybrid: true };
  } else {
    // agentic
    body = { query, top_k: 3, use_hybrid: true };
  }

  const resp = await fetch(`${API}${cfg.endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(resp.statusText);

  const data = await resp.json();
  removeThinking();

  if (currentMode === "hybrid") {
    // Render search hits as a formatted list
    const hits = data.hits || [];
    if (!hits.length) {
      appendAiBubble("No matching papers found for that query.");
      chatHistory.push({ role: "assistant", content: "No matching papers found for that query.", sources: [] });
      return;
    }
    const text = hits.map((h, i) => {
      const title = h.title || h.arxiv_id || "Untitled";
      const snippet = (h.chunk_text || h.abstract || "").slice(0, 220);
      return `**${i + 1}. ${title}**\n${snippet}${snippet.length >= 220 ? "…" : ""}`;
    }).join("\n\n");
    const sources = hits.map(h => h.pdf_url).filter(Boolean);
    appendAiBubble(text, sources);
    chatHistory.push({ role: "assistant", content: text, sources });
  } else {
    // Agentic response
    const text      = data.answer || "No answer returned.";
    const sources   = data.sources || [];
    const reasoning = data.reasoning_steps || [];
    appendAiBubble(text, sources, reasoning);
    chatHistory.push({ role: "assistant", content: text, sources, reasoning });
  }
}
