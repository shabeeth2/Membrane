import { SUPPORTED_HOSTS } from "./config.js";
import type { ContextDetail, ContextSummary, RuntimeResponse } from "./types.js";

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const contextsEl = document.getElementById("contexts") as HTMLDivElement;
const emptyStateEl = document.getElementById("empty-state") as HTMLDivElement;
const refreshButton = document.getElementById("refresh") as HTMLButtonElement;
const saveCurrentButton = document.getElementById("save-current") as HTMLButtonElement;

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function activeTabSupported(): Promise<boolean> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    return false;
  }
  try {
    const url = new URL(tab.url);
    return SUPPORTED_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

async function sendRuntime<T>(message: unknown): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as RuntimeResponse<T>;
  if (!response.ok) {
    throw new Error(response.error || "Request failed");
  }
  return response.data as T;
}

async function injectContext(id: number): Promise<void> {
  const supported = await activeTabSupported();
  if (!supported) {
    setStatus("Unsupported site");
    return;
  }

  setStatus("Injecting...");
  const detail = await sendRuntime<ContextDetail>({ type: "GET_CONTEXT", id });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("Unsupported site");
  }
  await chrome.tabs.sendMessage(tab.id, { type: "INJECT_CONTEXT", content: detail.content });
  setStatus("Context injected");
}

async function saveCurrentChat(): Promise<void> {
  const supported = await activeTabSupported();
  if (!supported) {
    setStatus("Unsupported site");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("Unsupported site");
    return;
  }

  saveCurrentButton.disabled = true;
  setStatus("Saving...");
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_VISIBLE_CHAT" });
    setStatus("Context saved");
    await loadContexts();
  } catch {
    setStatus("Could not save context");
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

  for (const context of contexts) {
    const row = document.createElement("button");
    row.className = "context-row";
    row.type = "button";

    const title = document.createElement("span");
    title.className = "context-title";
    title.textContent = context.title;

    const date = document.createElement("span");
    date.className = "context-date";
    date.textContent = formatDate(context.created_at);

    row.append(title, date);
    row.addEventListener("click", () => {
      void injectContext(context.id).catch(() => setStatus("Could not inject context"));
    });

    contextsEl.appendChild(row);
  }
}

async function loadContexts(): Promise<void> {
  setStatus("Loading...");
  contextsEl.replaceChildren();
  emptyStateEl.style.display = "none";
  try {
    const contexts = await sendRuntime<ContextSummary[]>({ type: "LIST_CONTEXTS" });
    renderContexts(contexts);
    if (contexts.length > 0) {
      setStatus("");
    }
  } catch {
    setStatus("Could not load contexts");
  }
}

refreshButton.addEventListener("click", () => {
  void loadContexts();
});

saveCurrentButton.addEventListener("click", () => {
  void saveCurrentChat();
});

void loadContexts();
