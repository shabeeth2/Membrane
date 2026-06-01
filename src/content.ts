import { SUPPORTED_HOSTS } from "./config.js";
import type { RuntimeRequest, RuntimeResponse } from "./types.js";

const BUTTON_ID = "membrane-save-context";
const IMPORT_BUTTON_ID = "membrane-import-context";
const MIN_CAPTURE_CHARS = 100;

function isSupportedHost(host = window.location.hostname): boolean {
  return SUPPORTED_HOSTS.includes(host);
}

function toast(message: string, tone: "neutral" | "success" | "error" = "neutral"): void {
  const existing = document.getElementById("membrane-toast");
  existing?.remove();

  const el = document.createElement("div");
  el.id = "membrane-toast";
  el.textContent = message;
  const toneColor = tone === "error" ? "#be123c" : tone === "success" ? "#0f766e" : "#134e4a";
  const toneBorder = tone === "error" ? "#fecdd3" : tone === "success" ? "#99f6e4" : "#ccfbf1";
  const toneBackground = tone === "error" ? "#fff1f2" : tone === "success" ? "#f0fdfa" : "#ffffff";
  Object.assign(el.style, {
    position: "fixed",
    right: "18px",
    bottom: "74px",
    zIndex: "2147483647",
    padding: "10px 12px",
    border: `1px solid ${toneBorder}`,
    borderRadius: "8px",
    color: toneColor,
    background: toneBackground,
    boxShadow: "0 12px 32px rgba(15, 118, 110, 0.18)",
    font: "600 13px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  });
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2400);
}

function visibleText(element: Element): string {
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    htmlElement.hidden ||
    htmlElement.getAttribute("aria-hidden") === "true"
  ) {
    return "";
  }
  return (htmlElement.innerText || htmlElement.textContent || "").trim();
}

function extractBySelectors(selectors: string[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((element) => {
      const text = visibleText(element);
      if (text.length > 0 && !seen.has(text)) {
        seen.add(text);
        parts.push(text);
      }
    });
    if (parts.join("\n").length >= MIN_CAPTURE_CHARS) {
      break;
    }
  }
  return parts.join("\n\n");
}

function genericMainText(): string {
  const main = document.querySelector("main") || document.body;
  const text = visibleText(main);
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !["Save Context", "Regenerate", "Share", "Copy"].includes(line))
    .join("\n");
}

function scrapeChat(): string {
  const host = window.location.hostname;
  let text = "";

  if (host === "chatgpt.com" || host === "chat.openai.com") {
    text = extractBySelectors([
      '[data-testid^="conversation-turn-"]',
      "[data-message-author-role]",
      "main article",
    ]);
  } else if (host === "claude.ai") {
    text = extractBySelectors([
      '[data-testid*="message"]',
      '[data-test-id*="message"]',
      "main [class*='message']",
      "main",
    ]);
  } else if (host === "www.perplexity.ai" || host === "perplexity.ai") {
    text = extractBySelectors([
      "main [data-testid]",
      "main article",
      "main [class*='answer']",
      "main",
    ]);
  }

  if (text.length < MIN_CAPTURE_CHARS) {
    text = genericMainText();
  }

  return text.trim();
}

async function sendRuntime<T>(request: RuntimeRequest): Promise<T> {
  const response = (await chrome.runtime.sendMessage(request)) as RuntimeResponse<T>;
  if (!response.ok) {
    throw new Error(response.error || "Request failed");
  }
  return response.data as T;
}

function injectButton(): void {
  if (!isSupportedHost() || document.getElementById(BUTTON_ID)) {
    return;
  }

  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.textContent = "Save Context";
  Object.assign(button.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: "2147483647",
    padding: "10px 13px",
    border: "1px solid #99f6e4",
    borderRadius: "8px",
    color: "#134e4a",
    background: "#f0fdfa",
    boxShadow: "0 12px 32px rgba(15, 118, 110, 0.18)",
    cursor: "pointer",
    font: "600 13px system-ui, sans-serif",
  });

  button.addEventListener("click", () => {
    void captureVisibleChat(button);
  });

  document.body.appendChild(button);
}

function importIconSvg(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="11" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="M10 12h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="m15 9 3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M7.5 8.5h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".65"/>
      <path d="M7.5 15.5h4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".65"/>
    </svg>
  `;
}

function nearestComposerContainer(input: HTMLElement): HTMLElement {
  const selectors = [
    "form",
    '[data-testid*="composer"]',
    '[data-testid*="prompt"]',
    '[class*="composer"]',
    '[class*="prompt"]',
    '[class*="input"]',
  ];

  for (const selector of selectors) {
    const container = input.closest<HTMLElement>(selector);
    if (container) {
      return container;
    }
  }

  return input.parentElement || input;
}

function placeImportButton(button: HTMLButtonElement, input: HTMLElement): void {
  const container = nearestComposerContainer(input);
  const containerRect = container.getBoundingClientRect();
  const inputRect = input.getBoundingClientRect();

  if (containerRect.width > 0 && containerRect.height > 0) {
    const style = window.getComputedStyle(container);
    if (style.position === "static") {
      container.style.position = "relative";
    }
    if (!container.contains(button)) {
      container.appendChild(button);
    }

    Object.assign(button.style, {
      position: "absolute",
      right: "44px",
      bottom: Math.max(8, Math.round(containerRect.bottom - inputRect.bottom + 8)) + "px",
    });
    return;
  }

  if (!document.body.contains(button)) {
    document.body.appendChild(button);
  }
  Object.assign(button.style, {
    position: "fixed",
    right: Math.max(18, Math.round(window.innerWidth - inputRect.right + 44)) + "px",
    bottom: Math.max(18, Math.round(window.innerHeight - inputRect.bottom + 8)) + "px",
  });
}

function createImportButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.id = IMPORT_BUTTON_ID;
  button.type = "button";
  button.title = "Open Membrane";
  button.setAttribute("aria-label", "Open Membrane");
  button.innerHTML = importIconSvg();
  Object.assign(button.style, {
    zIndex: "2147483647",
    width: "32px",
    height: "32px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    border: "1px solid #99f6e4",
    borderRadius: "8px",
    color: "#0f766e",
    background: "#f0fdfa",
    boxShadow: "0 8px 20px rgba(15, 118, 110, 0.16)",
    cursor: "pointer",
    transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
  });

  const icon = button.querySelector("svg");
  if (icon) {
    Object.assign((icon as SVGElement).style, {
      width: "18px",
      height: "18px",
      display: "block",
    });
  }

  button.addEventListener("mouseenter", () => {
    button.style.background = "#ccfbf1";
    button.style.borderColor = "#5eead4";
    button.style.color = "#134e4a";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = "#f0fdfa";
    button.style.borderColor = "#99f6e4";
    button.style.color = "#0f766e";
  });
  button.addEventListener("focus", () => {
    button.style.outline = "2px solid #0d9488";
    button.style.outlineOffset = "2px";
  });
  button.addEventListener("blur", () => {
    button.style.outline = "none";
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openPopup();
  });

  return button;
}

async function openPopup(): Promise<void> {
  try {
    await sendRuntime({ type: "OPEN_POPUP" });
  } catch {
    toast("Click the Membrane toolbar icon", "error");
  }
}

function injectImportButton(): void {
  if (!isSupportedHost()) {
    return;
  }

  const input = findInput();
  if (!input) {
    return;
  }

  const button = (document.getElementById(IMPORT_BUTTON_ID) as HTMLButtonElement | null) || createImportButton();
  placeImportButton(button, input);
}

function findInput(): HTMLElement | null {
  const selectors = [
    "textarea",
    '[contenteditable="true"]',
    '[role="textbox"]',
    "div.ProseMirror",
  ];
  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const visible = elements.find((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
    });
    if (visible) {
      return visible;
    }
  }
  return null;
}

function currentInputText(input: HTMLElement): string {
  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    return input.value;
  }
  return input.innerText || input.textContent || "";
}

function moveCaretToEnd(input: HTMLElement): void {
  input.focus();
  const selection = window.getSelection();
  if (!selection || input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    return;
  }
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
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: appendText }),
    );
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
      (error: unknown) => {
        const message = error instanceof Error ? error.message : "Could not save context";
        sendResponse({ ok: false, error: message });
      },
    );
    return true;
  }

  if (request.type !== "INJECT_CONTEXT") {
    return false;
  }

  try {
    if (!isSupportedHost()) {
      throw new Error("Unsupported site");
    }
    const input = findInput();
    if (!input) {
      throw new Error("Could not inject context");
    }
    const text = injectionText(request.content);
    setInputText(input, text);
    if (!currentInputText(input).includes("--- CONTEXT START ---")) {
      throw new Error("Could not inject context");
    }
    toast("Context injected", "success");
    sendResponse({ ok: true, data: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not inject context";
    toast(message, "error");
    sendResponse({ ok: false, error: message });
  }
  return true;
});

injectButton();
injectImportButton();

let importButtonRenderTimer: number | undefined;
function scheduleImportButtonRender(): void {
  window.clearTimeout(importButtonRenderTimer);
  importButtonRenderTimer = window.setTimeout(injectImportButton, 150);
}

const composerObserver = new MutationObserver(scheduleImportButtonRender);
composerObserver.observe(document.body, { childList: true, subtree: true });
window.addEventListener("resize", scheduleImportButtonRender);

async function captureVisibleChat(button?: HTMLButtonElement): Promise<void> {
  button?.setAttribute("disabled", "true");
  if (button) {
    button.textContent = "Saving...";
    button.style.cursor = "wait";
    button.style.opacity = "0.72";
  }
  try {
    const rawChat = scrapeChat();
    if (rawChat.length < MIN_CAPTURE_CHARS) {
      toast("Could not find chat content", "error");
      throw new Error("Could not find chat content");
    }
    await sendRuntime({ type: "CAPTURE_CONTEXT", rawChat });
    toast("Context saved", "success");
  } catch (error) {
    if (!(error instanceof Error && error.message === "Could not find chat content")) {
      toast("Could not save context", "error");
    }
    throw error;
  } finally {
    if (button) {
      button.textContent = "Save Context";
      button.removeAttribute("disabled");
      button.style.cursor = "pointer";
      button.style.opacity = "1";
    }
  }
}
