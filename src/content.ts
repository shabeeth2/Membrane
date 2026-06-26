import { SUPPORTED_HOSTS, HOST_NAMES } from "./config.js";
import type { RuntimeRequest, RuntimeResponse } from "./types.js";

const RELAY_TRIGGER_ID = "relay-trigger";
const MIN_CAPTURE_CHARS = 100;

function isSupportedHost(host = window.location.hostname): boolean {
  return SUPPORTED_HOSTS.includes(host);
}

function currentSite(host = window.location.hostname): string {
  return HOST_NAMES[host] ?? "unknown";
}

function loadStyles(): void {
  const id = "relay-styles";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("injected.css");
  document.head.appendChild(link);
}

function toast(message: string, tone: "neutral" | "success" | "error" = "neutral"): void {
  const existing = document.getElementById("relay-toast");
  existing?.remove();
  const el = document.createElement("div");
  el.id = "relay-toast";
  el.className = "relay-toast";
  el.dataset.tone = tone;
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    right: "18px",
    bottom: "74px",
    zIndex: "2147483647",
  });
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2700);
}

function setButtonState(state: "idle" | "loading"): void {
  const trigger = document.getElementById(RELAY_TRIGGER_ID);
  if (!trigger) return;
  trigger.classList.toggle("is-loading", state === "loading");
}

function visibleText(element: Element): string {
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  if (style.display === "none" || style.visibility === "hidden" || htmlElement.hidden || htmlElement.getAttribute("aria-hidden") === "true") return "";
  return (htmlElement.innerText || htmlElement.textContent || "").trim();
}

function extractBySelectors(selectors: string[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((element) => {
      const text = visibleText(element);
      if (text.length > 0 && !seen.has(text)) { seen.add(text); parts.push(text); }
    });
    if (parts.join("\n").length >= MIN_CAPTURE_CHARS) break;
  }
  return parts.join("\n\n");
}

function genericMainText(): string {
  const main = document.querySelector("main") || document.body;
  const text = visibleText(main);
  return text.split("\n").map(l => l.trim()).filter(Boolean).filter(l => !["Save Context", "Regenerate", "Share", "Copy"].includes(l)).join("\n");
}

function scrapeChat(): string {
  const host = window.location.hostname;
  let text = "";
  const site = currentSite(host);
  if (site === "ChatGPT") text = extractBySelectors(['[data-testid^="conversation-turn-"]', "[data-message-author-role]", "main article"]);
  else if (site === "Claude") text = extractBySelectors(['[data-testid*="message"]', '[data-test-id*="message"]', "main [class*='message']", "main"]);
  else if (site === "Perplexity") text = extractBySelectors(["main [data-testid]", "main article", "main [class*='answer']", "main"]);
  else if (site === "Gemini") text = extractBySelectors(["message-content", "model-response", "user-query", "chat-window [class*='message']", "main"]);
  else if (site === "Copilot") text = extractBySelectors(['[data-content="conversation"]', '[data-testid*="message"]', "cib-message", "main [class*='message']", "main"]);
  else if (site === "Grok") text = extractBySelectors(['[data-testid*="message"]', "main [class*='message']", "main article", "main"]);
  else if (site === "Mistral") text = extractBySelectors(['[data-testid*="message"]', "main [class*='message']", "main article", "main"]);
  if (text.length < MIN_CAPTURE_CHARS) text = genericMainText();
  return text.trim();
}

async function sendRuntime<T>(request: RuntimeRequest): Promise<T> {
  const response = (await chrome.runtime.sendMessage(request)) as RuntimeResponse<T>;
  if (!response.ok) throw new Error(response.error || "Request failed");
  return response.data as T;
}


function visibleElement(element: Element | null): HTMLElement | null {
  if (!(element instanceof HTMLElement)) return null;
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  if (rect.width <= 0 || rect.height <= 0 || style.visibility === "hidden" || style.display === "none") return null;
  return element;
}

function firstVisible(selectors: string[], root: ParentNode = document): HTMLElement | null {
  for (const selector of selectors) {
    for (const element of Array.from(root.querySelectorAll(selector))) {
      const visible = visibleElement(element);
      if (visible) return visible;
    }
  }
  return null;
}

function closestVisible(input: HTMLElement, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const container = visibleElement(input.closest(selector));
    if (container) return container;
  }
  return null;
}

function containsRelayTrigger(element: HTMLElement): boolean {
  return Boolean(element.querySelector(`#${RELAY_TRIGGER_ID}`));
}

// Per-site insertion points: [toolbarSelector, insertBeforeSelector?]
const SITE_INSERT_POINTS: Record<string, [string, string?]> = {
  ChatGPT: ['form[class*="composer"]', 'button[aria-label="Start dictation"], button[aria-label="Send"]'],
  Gemini: ['input-area-v2 [class*="actions"]', '[aria-label="Microphone"], [data-testid="microphone-button"]'],
  Claude: ['[data-testid*="composer"] [class*="button"]', 'button[aria-label="Send Message"]'],
  Perplexity: ['main form [class*="items-center"]', 'button[aria-label="Submit"]'],
  Copilot: ['form [class*="actions"]', 'button[aria-label="Send"]'],
  Grok: ['form', 'button[type="submit"], button[aria-label*="Send"]'],
  Mistral: ['form [class*="items-center"]', 'button[type="submit"]'],
};

function placeRelayTrigger(container: HTMLElement, input: HTMLElement): void {
  const site = currentSite();
  const insertPoint = SITE_INSERT_POINTS[site];

  if (insertPoint) {
    const [toolbarSelector, beforeSelector] = insertPoint;
    const toolbar = firstVisible([toolbarSelector]);
    if (toolbar && !containsRelayTrigger(toolbar as HTMLElement)) {
      if (beforeSelector) {
        const beforeBtn = toolbar.querySelector(beforeSelector);
        if (beforeBtn && toolbar.contains(beforeBtn)) {
          beforeBtn.parentElement!.insertBefore(container, beforeBtn);
          return;
        }
      }
      toolbar.appendChild(container);
      return;
    }
  }

  const parentContainer = closestVisible(input, ["form", '[data-testid*="composer"]', '[data-testid*="prompt"]', '[class*="composer"]', '[class*="prompt"]', '[class*="input"]']) || input.parentElement;
  if (parentContainer) {
    const actionRow = firstVisible(['[class*="actions"]', '[class*="toolbar"]', '[class*="footer"]'], parentContainer);
    if (actionRow && !containsRelayTrigger(actionRow as HTMLElement)) {
      (actionRow as HTMLElement).appendChild(container);
      return;
    }
  }

  attachFixed(container, input);
}

function attachFixed(element: HTMLElement, input?: HTMLElement): void {
  if (!document.body.contains(element)) document.body.appendChild(element);
  const inputRect = input?.getBoundingClientRect();
  const hasRect = inputRect && inputRect.width > 0 && inputRect.height > 0;
  Object.assign(element.style, {
    position: "fixed",
    right: hasRect ? Math.max(18, Math.round(window.innerWidth - inputRect!.right + 44)) + "px" : "18px",
    bottom: hasRect ? Math.max(18, Math.round(window.innerHeight - inputRect!.bottom + 8)) + "px" : "80px",
    margin: "0",
    transform: "",
  });
}

function createRelayTrigger(): HTMLDivElement {
  const container = document.createElement("div");
  container.id = RELAY_TRIGGER_ID;
  container.className = "relay-trigger";

  const icon = document.createElement("div");
  icon.className = "relay-trigger-icon";
  icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><rect x="4" y="4" width="3" height="16" rx="1.5" fill="currentColor"/><rect x="10.5" y="2" width="3" height="20" rx="1.5" fill="currentColor"/><rect x="17" y="7" width="3" height="10" rx="1.5" fill="currentColor"/><path d="M2 12h20" stroke="#00e680" stroke-width="2.5" stroke-linecap="round"/><path d="M17 8l5 4-5 4" stroke="#00e680" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  icon.title = "Save Context";

  // Click = save (70% use case)
  icon.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void captureVisibleChat();
  });

  // Right-click = open popup to choose context (30% use case)
  icon.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void openPopup();
  });

  container.appendChild(icon);
  return container;
}

async function openPopup(): Promise<void> {
  try { await sendRuntime({ type: "OPEN_POPUP" }); }
  catch { toast("Click the Relay toolbar icon", "error"); }
}

function injectRelayTrigger(): void {
  if (!isSupportedHost()) return;
  const existing = document.getElementById(RELAY_TRIGGER_ID);
  const input = findInput();
  if (!input) return;
  const container = existing || createRelayTrigger();
  placeRelayTrigger(container, input);
}

function findInput(): HTMLElement | null {
  const selectors = ["#prompt-textarea", "rich-textarea", "textarea", '[contenteditable="true"]', '[role="textbox"]', "div.ProseMirror", '[class*="ProseMirror"]', '[class*="composer"] [contenteditable]'];
  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const visible = elements.find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (visible) return visible;
  }
  return null;
}

function currentInputText(input: HTMLElement): string {
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) return input.value;
  return input.innerText || input.textContent || "";
}

function moveCaretToEnd(input: HTMLElement): void {
  input.focus();
  const selection = window.getSelection();
  if (!selection || input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) return;
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setInputText(input: HTMLElement, text: string): void {
  const existing = currentInputText(input);
  const appendText = existing.trim().length > 0 ? `\n\n${text}` : text;
  const next = existing.trim().length > 0 ? `${existing}${appendText}` : text;
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    input.value = next;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: next }));
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    return;
  }
  moveCaretToEnd(input);
  const inserted = document.execCommand("insertText", false, appendText);
  if (!inserted) {
    input.textContent = next;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: appendText }));
  }
}

function injectionText(content: string): string {
  return `You are continuing an existing project.

Here is the full working context:

--- CONTEXT START ---
${content}
--- CONTEXT END ---

First, acknowledge you understand this context. Then wait for my next instruction.`;
}

chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
  if (request.type === "CAPTURE_VISIBLE_CHAT") {
    void captureVisibleChat().then(
      () => sendResponse({ ok: true, data: true }),
      (error: unknown) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not save context" }),
    );
    return true;
  }
  if (request.type !== "INJECT_CONTEXT") return false;
  try {
    if (!isSupportedHost()) throw new Error("Unsupported site");
    const input = findInput();
    if (!input) throw new Error("Could not inject context");
    const text = injectionText(request.content);
    setInputText(input, text);
    if (!currentInputText(input).includes("--- CONTEXT START ---")) throw new Error("Could not inject context");
    toast("Context injected", "success");
    sendResponse({ ok: true, data: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not inject context";
    toast(message, "error");
    sendResponse({ ok: false, error: message });
  }
  return true;
});

loadStyles();

const RETRY_DELAYS = [0, 500, 1500, 3000];

function tryInjectWithRetry(attempt = 0): void {
  injectRelayTrigger();
  if (!document.getElementById(RELAY_TRIGGER_ID) && attempt < RETRY_DELAYS.length - 1) {
    window.setTimeout(() => tryInjectWithRetry(attempt + 1), RETRY_DELAYS[attempt + 1]);
  }
}

tryInjectWithRetry();

let relayRenderTimer: number | undefined;
function scheduleRelayRender(): void {
  window.clearTimeout(relayRenderTimer);
  relayRenderTimer = window.setTimeout(injectRelayTrigger, 500);
}

const composerObserver = new MutationObserver(scheduleRelayRender);
composerObserver.observe(document.body, { childList: true, subtree: true });
window.addEventListener("resize", scheduleRelayRender);

async function captureVisibleChat(): Promise<void> {
  setButtonState("loading");
  try {
    const rawChat = scrapeChat();
    if (rawChat.length < MIN_CAPTURE_CHARS) { toast("Could not find chat content", "error"); throw new Error("Could not find chat content"); }
    await sendRuntime({ type: "CAPTURE_CONTEXT", rawChat });
    toast("Context saved", "success");
  } catch (error) {
    if (!(error instanceof Error && error.message === "Could not find chat content")) toast("Could not save context", "error");
    throw error;
  } finally {
    setButtonState("idle");
  }
}
