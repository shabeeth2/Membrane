import { API_BASE_URL } from "./config.js";
import type { CaptureResult, ContextDetail, ContextSummary } from "./types.js";

const CLIENT_ID_KEY = "membrane_client_id";

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getClientId(): Promise<string> {
  const stored = await chrome.storage.local.get(CLIENT_ID_KEY);
  const existing = stored[CLIENT_ID_KEY];
  if (typeof existing === "string" && existing.length > 0) {
    return existing;
  }

  const next = randomId();
  await chrome.storage.local.set({ [CLIENT_ID_KEY]: next });
  return next;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const clientId = await getClientId();
  const headers = new Headers(init.headers);
  headers.set("X-Membrane-Client-Id", clientId);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : "Request failed";
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export function listContexts(): Promise<ContextSummary[]> {
  return apiFetch<ContextSummary[]>("/list-contexts");
}

export function getContext(id: number): Promise<ContextDetail> {
  return apiFetch<ContextDetail>(`/get-context/${id}`);
}

export function captureContext(rawChat: string): Promise<CaptureResult> {
  return apiFetch<CaptureResult>("/capture-context", {
    method: "POST",
    body: JSON.stringify({ raw_chat: rawChat }),
  });
}
