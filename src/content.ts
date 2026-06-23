import { SUPPORTED_HOSTS } from "./config.js";
import type { RuntimeRequest, RuntimeResponse } from "./types.js";

const RELAY_CONTROLS_ID = "relay-controls";
const IMPORT_BUTTON_ID = "relay-import-context";
const MIN_CAPTURE_CHARS = 100;

function isSupportedHost(host = window.location.hostname): boolean {
  return SUPPORTED_HOSTS.includes(host);
}

function currentSite(host = window.location.hostname): "chatgpt" | "claude" | "perplexity" | "gemini" | "copilot" | "grok" | "mistral" | "unknown" {
  if (host === "chatgpt.com" || host === "chat.openai.com") return "chatgpt";
  if (host === "claude.ai") return "claude";
  if (host === "www.perplexity.ai" || host === "perplexity.ai") return "perplexity";
  if (host === "gemini.google.com" || host === "bard.google.com") return "gemini";
  if (host === "copilot.microsoft.com") return "copilot";
  if (host === "grok.com") return "grok";
  if (host === "chat.mistral.ai") return "mistral";
  return "unknown";
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

function setButtonState(button: HTMLButtonElement, state: "idle" | "loading"): void {
  button.classList.toggle("is-loading", state === "loading");
  button.disabled = state === "loading";
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
  if (site === "chatgpt") text = extractBySelectors(['[data-testid^="conversation-turn-"]', "[data-message-author-role]", "main article"]);
  else if (site === "claude") text = extractBySelectors(['[data-testid*="message"]', '[data-test-id*="message"]', "main [class*='message']", "main"]);
  else if (site === "perplexity") text = extractBySelectors(["main [data-testid]", "main article", "main [class*='answer']", "main"]);
  else if (site === "gemini") text = extractBySelectors(["message-content", "model-response", "user-query", "chat-window [class*='message']", "main"]);
  else if (site === "copilot") text = extractBySelectors(['[data-content="conversation"]', '[data-testid*="message"]', "cib-message", "main [class*='message']", "main"]);
  else if (site === "grok") text = extractBySelectors(['[data-testid*="message"]', "main [class*='message']", "main article", "main"]);
  else if (site === "mistral") text = extractBySelectors(['[data-testid*="message"]', "main [class*='message']", "main article", "main"]);
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

function evaluateXPath(path: string): HTMLElement | null {
  const result = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return visibleElement(result.singleNodeValue as Element | null);
}

function containsRelayControls(element: HTMLElement): boolean {
  return Boolean(element.querySelector(`#${RELAY_CONTROLS_ID}`));
}

function resetImportButtonPlacement(element: HTMLElement): void {
  Object.assign(element.style, { position: "", inset: "", right: "", bottom: "", margin: "", transform: "" });
}

function attachInFlow(container: HTMLElement, target: HTMLElement, before: Element | null = null): boolean {
  if (target === container) return false;
  if (target.contains(container)) { resetImportButtonPlacement(container); return true; }
  if (containsRelayControls(target)) return false;
  resetImportButtonPlacement(container);
  if (before && before.parentElement === target) target.insertBefore(container, before);
  else if (!target.contains(container)) target.appendChild(container);
  return true;
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

function placeGeminiButton(container: HTMLElement, input: HTMLElement): boolean {
  const quickCompose = firstVisible(["sider-quick-compose-btn", "bard-sidenav-content sider-quick-compose-btn"]);
  if (quickCompose?.parentElement && attachInFlow(container, quickCompose.parentElement, quickCompose)) return true;
  const xpathTarget = evaluateXPath("/html/body/chat-app/main/side-navigation-v2/bard-sidenav-container/bard-sidenav-content/div/div/div/chat-window/div/input-container/fieldset/input-area-v2/div/div/div[1]/div/div/div/rich-textarea/sider-quick-compose-btn");
  if (xpathTarget?.parentElement && attachInFlow(container, xpathTarget.parentElement, xpathTarget)) return true;
  const inputArea = visibleElement(input.closest("input-container, input-area-v2, fieldset"));
  const actionRow = firstVisible(["[class*='quick']", "[class*='action']", "[class*='toolbar']"], inputArea || document);
  if (actionRow && attachInFlow(container, actionRow)) return true;
  return false;
}

function placeByNativeControls(container: HTMLElement, input: HTMLElement): boolean {
  const site = currentSite();
  if (site === "gemini" && placeGeminiButton(container, input)) return true;
  const siteSelectors: Record<string, string[]> = {
    chatgpt: ['[data-testid="composer-footer-actions"]', '[data-testid*="composer"] [class*="items-center"]'],
    claude: ['[data-testid*="composer"] [class*="button"]', '[class*="composer"] [class*="actions"]'],
    perplexity: ['main form [class*="items-center"]', '[class*="composer"] [class*="items-center"]'],
    copilot: ['form [class*="actions"]', 'form [class*="toolbar"]', '[class*="composer"] [class*="actions"]'],
    grok: ['form [class*="items-center"]', '[class*="composer"] [class*="items-center"]'],
    mistral: ['form [class*="items-center"]', '[class*="composer"] [class*="actions"]'],
    unknown: [],
  };
  const parentContainer = closestVisible(input, ["form", '[data-testid*="composer"]', '[data-testid*="prompt"]', '[class*="composer"]', '[class*="prompt"]', '[class*="input"]']) || input.parentElement;
  const actionRow = firstVisible(siteSelectors[site] || [], parentContainer || document);
  if (actionRow && attachInFlow(container, actionRow)) return true;
  if (parentContainer && attachInFlow(container, parentContainer)) {
    const style = window.getComputedStyle(parentContainer);
    if (style.display !== "flex" && style.display !== "inline-flex") container.style.marginLeft = "8px";
    return true;
  }
  return false;
}

function placeRelayControls(container: HTMLElement, input: HTMLElement): void {
  if (placeByNativeControls(container, input)) {
    // Verify the placed container is actually visible; if clipped, fall back to fixed
    if (!visibleElement(container)) attachFixed(container, input);
    return;
  }
  attachFixed(container, input);
}

function createRelayControls(): HTMLDivElement {
  const container = document.createElement("div");
  container.id = RELAY_CONTROLS_ID;
  container.className = "relay-controls";

  const saveBtn = document.createElement("button");
  saveBtn.id = "relay-save-inline";
  saveBtn.type = "button";
  saveBtn.className = "relay-btn--icon";
  saveBtn.title = "Save chat context";
  saveBtn.setAttribute("aria-label", "Save chat context");
  saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void captureVisibleChat(saveBtn);
  });

  const importBtn = document.createElement("button");
  importBtn.id = IMPORT_BUTTON_ID;
  importBtn.type = "button";
  importBtn.className = "relay-btn--icon";
  importBtn.title = "Open Relay";
  importBtn.setAttribute("aria-label", "Open Relay");
  importBtn.innerHTML = `<img src="${chrome.runtime.getURL("assets/icon-16.png")}" alt="" style="width:16px;height:16px;display:block;pointer-events:none">`;
  importBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    void openPopup();
  });

  container.append(saveBtn, importBtn);
  return container;
}

async function openPopup(): Promise<void> {
  try { await sendRuntime({ type: "OPEN_POPUP" }); }
  catch { toast("Click the Relay toolbar icon", "error"); }
}

function injectRelayControls(): void {
  if (!isSupportedHost()) return;
  const input = findInput();
  if (!input) return;
  const container = (document.getElementById(RELAY_CONTROLS_ID) as HTMLDivElement | null) || createRelayControls();
  placeRelayControls(container, input);
}

function findInput(): HTMLElement | null {
  const selectors = ["rich-textarea", "textarea", '[contenteditable="true"]', '[role="textbox"]', "div.ProseMirror", '[class*="ProseMirror"]', '[class*="composer"] [contenteditable]'];
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
  injectRelayControls();
  if (!document.getElementById(RELAY_CONTROLS_ID) && attempt < RETRY_DELAYS.length - 1) {
    window.setTimeout(() => tryInjectWithRetry(attempt + 1), RETRY_DELAYS[attempt + 1]);
  }
}

tryInjectWithRetry();

let relayRenderTimer: number | undefined;
function scheduleRelayRender(): void {
  window.clearTimeout(relayRenderTimer);
  relayRenderTimer = window.setTimeout(injectRelayControls, 150);
}

const composerObserver = new MutationObserver(scheduleRelayRender);
composerObserver.observe(document.body, { childList: true, subtree: true });
window.addEventListener("resize", scheduleRelayRender);

async function captureVisibleChat(button?: HTMLButtonElement): Promise<void> {
  if (button) setButtonState(button, "loading");
  try {
    const rawChat = scrapeChat();
    if (rawChat.length < MIN_CAPTURE_CHARS) { toast("Could not find chat content", "error"); throw new Error("Could not find chat content"); }
    await sendRuntime({ type: "CAPTURE_CONTEXT", rawChat });
    toast("Context saved", "success");
  } catch (error) {
    if (!(error instanceof Error && error.message === "Could not find chat content")) toast("Could not save context", "error");
    throw error;
  } finally {
    if (button) setButtonState(button, "idle");
  }
}
