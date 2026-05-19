import { captureContext, getContext, listContexts } from "./client.js";
import type { RuntimeRequest, RuntimeResponse } from "./types.js";

chrome.runtime.onMessage.addListener(
  (
    request: RuntimeRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: RuntimeResponse) => void,
  ) => {
    void handleMessage(request, sender)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Request failed";
        sendResponse({ ok: false, error: message });
      });
    return true;
  },
);

async function handleMessage(request: RuntimeRequest, sender: chrome.runtime.MessageSender) {
  switch (request.type) {
    case "LIST_CONTEXTS":
      return listContexts();
    case "GET_CONTEXT":
      return getContext(request.id);
    case "CAPTURE_CONTEXT":
      return captureContext(request.rawChat);
    case "INJECT_CONTEXT":
      if (!sender.tab?.id) {
        throw new Error("Unsupported site");
      }
      return chrome.tabs.sendMessage(sender.tab.id, request);
    default:
      throw new Error("Unsupported request");
  }
}
