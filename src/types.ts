export interface ContextSummary {
  id: number;
  title: string;
  created_at: string;
}

export interface ContextDetail extends ContextSummary {
  content: string;
}

export interface CaptureResult extends ContextSummary {
  deduped: boolean;
  truncated: boolean;
}

export type RuntimeRequest =
  | { type: "LIST_CONTEXTS" }
  | { type: "GET_CONTEXT"; id: number }
  | { type: "CAPTURE_CONTEXT"; rawChat: string }
  | { type: "INJECT_CONTEXT"; content: string }
  | { type: "CAPTURE_VISIBLE_CHAT" }
  | { type: "OPEN_POPUP" };

export interface RuntimeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
