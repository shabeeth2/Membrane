import { SUPPORTED_HOSTS } from "./config.js";
import type { ContextDetail, ContextSummary, RuntimeResponse } from "./types.js";

type StatusTone = "info" | "success" | "error";

const statusEl = document.getElementById("status") as HTMLElement;
const contextsEl = document.getElementById("contexts") as HTMLDivElement;
const emptyStateEl = document.getElementById("empty-state") as HTMLDivElement;
const refreshButton = document.getElementById("refresh") as HTMLButtonElement;
const saveCurrentButton = document.getElementById("save-current") as HTMLButtonElement;

function setStatus(message: string, tone?: StatusTone): void {
  statusEl.textContent = message;
  if (message && tone) {
    statusEl.dataset.tone = tone;
  } else if (!message) {
    delete statusEl.dataset.tone;
  }
}

function timeAgo(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function activeTabSupported(): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return false;
  try {
    const url = new URL(tab.url);
    return SUPPORTED_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

async function sendRuntime<T>(message: unknown): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as RuntimeResponse<T>;
  if (!response.ok) throw new Error(response.error || "Request failed");
  return response.data as T;
}

async function injectContext(id: number): Promise<void> {
  const supported = await activeTabSupported();
  if (!supported) { setStatus("Unsupported site", "error"); return; }
  setStatus("Injecting...", "info");
  const detail = await sendRuntime<ContextDetail>({ type: "GET_CONTEXT", id });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Unsupported site");
  await chrome.tabs.sendMessage(tab.id, { type: "INJECT_CONTEXT", content: detail.content });
  setStatus("Context injected", "success");
}

async function saveCurrentChat(): Promise<void> {
  const supported = await activeTabSupported();
  if (!supported) { setStatus("Unsupported site", "error"); return; }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { setStatus("Unsupported site", "error"); return; }
  saveCurrentButton.disabled = true;
  setStatus("Saving...", "info");
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_VISIBLE_CHAT" });
    setStatus("Context saved", "success");
    await loadContexts();
  } catch {
    setStatus("Could not save context", "error");
  } finally {
    saveCurrentButton.disabled = false;
  }
}

function renderContexts(contexts: ContextSummary[]): void {
  contextsEl.replaceChildren();
  if (contexts.length === 0) {
    emptyStateEl.style.display = "flex";
    return;
  }
  emptyStateEl.style.display = "none";

  for (const [i, context] of contexts.entries()) {
    const row = document.createElement("button");
    row.className = "context-row";
    row.type = "button";
    row.style.animationDelay = `${i * 40}ms`;

    const title = document.createElement("span");
    title.className = "context-title";
    title.textContent = context.title;

    const date = document.createElement("span");
    date.className = "context-date";
    date.textContent = timeAgo(context.created_at);

    row.append(title, date);
    row.addEventListener("click", () => {
      void injectContext(context.id).catch(() => setStatus("Could not inject context", "error"));
    });

    contextsEl.appendChild(row);
  }
}

async function loadContexts(): Promise<void> {
  setStatus("Loading...", "info");
  contextsEl.replaceChildren();
  emptyStateEl.style.display = "none";
  try {
    const contexts = await sendRuntime<ContextSummary[]>({ type: "LIST_CONTEXTS" });
    renderContexts(contexts);
    if (contexts.length > 0) setStatus("");
  } catch {
    setStatus("Could not load contexts", "error");
  }
}

refreshButton.addEventListener("click", () => { void loadContexts(); });
saveCurrentButton.addEventListener("click", () => { void saveCurrentChat(); });
void loadContexts();
