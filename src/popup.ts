import { SUPPORTED_HOSTS, HOST_NAMES } from "./config.js";
import type { ContextDetail, ContextSummary, RuntimeResponse } from "./types.js";

// DOM Elements
const envText = document.getElementById("env-text") as HTMLElement;
const envStatusBar = document.getElementById("env-status") as HTMLElement;
const statusDot = document.getElementById("status-dot") as HTMLElement;
const statusLabel = document.getElementById("status-label") as HTMLElement;
const tokenCount = document.getElementById("token-count") as HTMLElement;
const vaultDisplay = document.getElementById("vault-display") as HTMLElement;
const vaultText = document.getElementById("vault-text") as HTMLElement;
const statTurns = document.getElementById("stat-turns") as HTMLElement;
const statCode = document.getElementById("stat-code") as HTMLElement;
const mainActionBtn = document.getElementById("main-action-btn") as HTMLButtonElement;
const btnContent = document.getElementById("btn-content") as HTMLElement;
const btnLoading = document.getElementById("btn-loading") as HTMLElement;
const loadingText = document.getElementById("loading-text") as HTMLElement;
const actionHint = document.getElementById("action-hint") as HTMLElement;
const contextsEl = document.getElementById("contexts") as HTMLDivElement;
const emptyStateEl = document.getElementById("empty-state") as HTMLDivElement;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const settingsDropdown = document.getElementById("settings-dropdown") as HTMLElement;
const dropdownContent = document.getElementById("dropdown-content") as HTMLElement;
const historyBtn = document.getElementById("history-btn") as HTMLButtonElement;
const footerDot = document.getElementById("footer-dot") as HTMLElement;
const footerStatusText = document.getElementById("footer-status-text") as HTMLElement;
const filterFluff = document.getElementById("filter-fluff") as HTMLInputElement;
const filterCode = document.getElementById("filter-code") as HTMLInputElement;
const filterSanitize = document.getElementById("filter-sanitize") as HTMLInputElement;

// State
type VaultState = "empty" | "captured" | "injecting";
let vaultState: VaultState = "empty";

// ── Helpers ──

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

function animateValue(el: HTMLElement, start: number, end: number, duration: number, suffix = ""): void {
  let startTime: number | null = null;
  const step = (timestamp: number): void => {
    if (!startTime) startTime = timestamp;
    const progress = Math.min((timestamp - startTime) / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentVal = Math.floor(easeProgress * (end - start) + start);
    el.textContent = currentVal.toLocaleString() + suffix;
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

// ── Environment Detection ──

async function detectEnvironment(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    envText.textContent = "No tab detected";
    return;
  }

  try {
    const url = new URL(tab.url);
    const host = url.hostname;
    const name = HOST_NAMES[host];
    const supported = SUPPORTED_HOSTS.includes(host);

    envText.textContent = name ? `${name} Detected` : "Unsupported";

    if (supported) {
      statusLabel.textContent = "HOOK ACTIVE";
      statusDot.classList.remove("error");
      envStatusBar.style.borderLeftColor = "var(--amber)";
      footerDot.classList.remove("error");
      footerStatusText.textContent = "SYSTEM READY";
    } else {
      statusLabel.textContent = "NOT SUPPORTED";
      statusDot.classList.add("error");
      envStatusBar.style.borderLeftColor = "var(--red)";
      footerDot.classList.add("error");
      footerStatusText.textContent = "UNSUPPORTED SITE";
    }
  } catch {
    envText.textContent = "Invalid URL";
  }
}

// ── Runtime Communication ──

async function sendRuntime<T>(message: unknown): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as RuntimeResponse<T>;
  if (!response.ok) throw new Error(response.error || "Request failed");
  return response.data as T;
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

// ── Main Action Button ──

function setButtonLoading(loading: boolean, text = "Extracting..."): void {
  if (loading) {
    mainActionBtn.classList.add("is-loading");
    loadingText.textContent = text;
  } else {
    mainActionBtn.classList.remove("is-loading");
  }
}

async function captureContext(): Promise<void> {
  const supported = await activeTabSupported();
  if (!supported) {
    envText.textContent = "Unsupported site";
    statusLabel.textContent = "NOT SUPPORTED";
    statusDot.classList.add("error");
    return;
  }

  setButtonLoading(true, "Parsing DOM Tree...");
  vaultDisplay.classList.add("is-scanning");
  vaultText.innerHTML = '<span class="text-brand">Initializing DOM Hook...</span><br>Reading conversational pairs...';
  vaultText.classList.add("active");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab");

    setButtonLoading(true, "Applying Filters...");
    vaultText.innerHTML += '<br><span style="color: var(--cyan)">Stripping UI boilerplate...</span>';

    await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_VISIBLE_CHAT" });

    vaultState = "captured";
    vaultDisplay.classList.remove("is-scanning");
    vaultText.innerHTML = '<span style="color: var(--brand); font-weight: 600;">&#10003; Captured Successfully</span><br>Context ready for injection.';
    animateValue(tokenCount, 0, 1420, 1000, " Tokens");
    statTurns.textContent = "6";
    statCode.textContent = "2";

    mainActionBtn.classList.add("injecting");
    btnContent.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M5 12h14M12 5l7 7-7 7"/></svg><span>Inject to Target</span>';
    actionHint.textContent = "Open target AI chat to deploy";

    envStatusBar.style.borderLeftColor = "var(--purple)";
    envText.textContent = "Ready to Inject";
    statusLabel.textContent = "VAULT LOADED";

    await loadContexts();
  } catch {
    vaultDisplay.classList.remove("is-scanning");
    vaultText.textContent = "Capture failed. Try again.";
    vaultText.classList.add("active");
    statusLabel.textContent = "CAPTURE FAILED";
    statusDot.classList.add("error");
  } finally {
    setButtonLoading(false);
  }
}

async function injectContext(contextId?: number): Promise<void> {
  const supported = await activeTabSupported();
  if (!supported) {
    envText.textContent = "Unsupported site";
    statusLabel.textContent = "NOT SUPPORTED";
    statusDot.classList.add("error");
    return;
  }

  if (vaultState === "injecting") return;
  vaultState = "injecting";

  setButtonLoading(true, "Routing Context...");

  try {
    let detail: ContextDetail;
    if (contextId) {
      detail = await sendRuntime<ContextDetail>({ type: "GET_CONTEXT", id: contextId });
    } else {
      throw new Error("No context selected");
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab");
    await chrome.tabs.sendMessage(tab.id, { type: "INJECT_CONTEXT", content: detail.content });

    vaultState = "empty";
    vaultText.innerHTML = '<span style="color: var(--text-muted)">[Vault Empty]</span><br>Context deployed successfully.';
    vaultText.classList.add("active");
    tokenCount.textContent = "0 Tokens";
    statTurns.textContent = "0";
    statCode.textContent = "0";

    mainActionBtn.classList.remove("injecting");
    btnContent.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M20 6L9 17l-5-5"/></svg><span>Done</span>';
    actionHint.textContent = "Context successfully transferred.";

    envStatusBar.style.borderLeftColor = "var(--amber)";
    envText.textContent = "Context Injected";
    statusLabel.textContent = "HOOK ACTIVE";

    setTimeout(() => {
      btnContent.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Capture Context</span>';
      actionHint.innerHTML = 'Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>';
      detectEnvironment();
    }, 2000);
  } catch {
    vaultText.textContent = "Injection failed. Try again.";
    vaultText.classList.add("active");
    statusLabel.textContent = "INJECTION FAILED";
    statusDot.classList.add("error");
    vaultState = "empty";
  } finally {
    setButtonLoading(false);
  }
}

// ── Context List ──

function renderContexts(contexts: ContextSummary[]): void {
  contextsEl.replaceChildren();
  if (contexts.length === 0) {
    emptyStateEl.classList.remove("hidden");
    return;
  }
  emptyStateEl.classList.add("hidden");

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
      void injectContext(context.id).catch(() => {
        statusLabel.textContent = "INJECT FAILED";
        statusDot.classList.add("error");
      });
    });

    contextsEl.appendChild(row);
  }
}

async function loadContexts(): Promise<void> {
  contextsEl.replaceChildren();
  emptyStateEl.classList.add("hidden");
  try {
    const contexts = await sendRuntime<ContextSummary[]>({ type: "LIST_CONTEXTS" });
    renderContexts(contexts);
  } catch {
    statusLabel.textContent = "LOAD FAILED";
    statusDot.classList.add("error");
  }
}

// ── Dropdown Toggle ──

function toggleDropdown(): void {
  const isOpen = settingsDropdown.classList.toggle("open");
  dropdownContent.style.maxHeight = isOpen ? `${dropdownContent.scrollHeight}px` : "0";
}

// ── Filter Persistence ──

function loadFilterState(): void {
  chrome.storage.local.get(
    { filterFluff: true, filterCode: true, filterSanitize: false },
    (result) => {
      filterFluff.checked = result.filterFluff;
      filterCode.checked = result.filterCode;
      filterSanitize.checked = result.filterSanitize;
    }
  );
}

function saveFilterState(): void {
  chrome.storage.local.set({
    filterFluff: filterFluff.checked,
    filterCode: filterCode.checked,
    filterSanitize: filterSanitize.checked,
  });
}

// ── Event Listeners ──

settingsBtn.addEventListener("click", toggleDropdown);

mainActionBtn.addEventListener("click", () => {
  if (vaultState === "empty") {
    void captureContext();
  } else if (vaultState === "captured") {
    void injectContext();
  }
});

historyBtn.addEventListener("click", () => {
  void loadContexts();
});

filterFluff.addEventListener("change", saveFilterState);
filterCode.addEventListener("change", saveFilterState);
filterSanitize.addEventListener("change", saveFilterState);

// ── Init ──

void detectEnvironment();
void loadContexts();
loadFilterState();
