import { SUPPORTED_HOSTS } from "./config.js";
import type { RuntimeRequest, RuntimeResponse } from "./types.js";

const BUTTON_ID = "membrane-save-context";
const MIN_CAPTURE_CHARS = 100;

function isSupportedHost(host = window.location.hostname): boolean {
  return SUPPORTED_HOSTS.includes(host);
}

function toast(message: string): void {
  const existing = document.getElementById("membrane-toast");
  existing?.remove();

  const el = document.createElement("div");
  el.id = "membrane-toast";
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    right: "18px",
    bottom: "74px",
    zIndex: "2147483647",
    padding: "9px 12px",
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    color: "#1f2328",
    background: "#ffffff",
    boxShadow: "0 8px 28px rgba(31, 35, 40, 0.18)",
    font: "13px system-ui, sans-serif",
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
    border: "1px solid #d0d7de",
    borderRadius: "8px",
    color: "#1f2328",
    background: "#ffffff",
    boxShadow: "0 8px 28px rgba(31, 35, 40, 0.18)",
    cursor: "pointer",
    font: "600 13px system-ui, sans-serif",
  });

  button.addEventListener("click", async () => {
    button.textContent = "Saving...";
    button.setAttribute("disabled", "true");
    try {
      const rawChat = scrapeChat();
      if (rawChat.length < MIN_CAPTURE_CHARS) {
        toast("Could not find chat content");
        return;
      }
      await sendRuntime({ type: "CAPTURE_CONTEXT", rawChat });
      toast("Context saved");
    } catch {
      toast("Could not save context");
    } finally {
      button.textContent = "Save Context";
      button.removeAttribute("disabled");
    }
  });

  document.body.appendChild(button);
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
    toast("Context injected");
    sendResponse({ ok: true, data: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not inject context";
    toast(message);
    sendResponse({ ok: false, error: message });
  }
  return true;
});

injectButton();
