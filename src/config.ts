export const API_BASE_URL = "http://localhost:8000";

export const SUPPORTED_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "claude.ai",
  "www.perplexity.ai",
  "perplexity.ai",
  "gemini.google.com",
  "bard.google.com",
  "copilot.microsoft.com",
  "grok.com",
  "chat.mistral.ai",
];

export const HOST_NAMES: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "www.perplexity.ai": "Perplexity",
  "perplexity.ai": "Perplexity",
  "gemini.google.com": "Gemini",
  "bard.google.com": "Gemini",
  "copilot.microsoft.com": "Copilot",
  "grok.com": "Grok",
  "chat.mistral.ai": "Mistral",
};
