import { openAICompatible, type AIProvider } from "./types";

export const AI_PROVIDERS: AIProvider[] = [
  openAICompatible({
    id: "openai", label: "OpenAI API", baseUrl: "https://api.openai.com/v1", signupUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-4o-mini", defaultMonthlyLimit: 500, noteKey: "ai.note.openai", modelFilter: /^(gpt|o\d|chatgpt)/i,
  }),
  openAICompatible({
    id: "gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", signupUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.0-flash", defaultMonthlyLimit: 1000, noteKey: "ai.note.gemini", modelFilter: /gemini/i,
  }),
  openAICompatible({
    id: "groq", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", signupUrl: "https://console.groq.com/keys",
    defaultModel: "llama-3.3-70b-versatile", defaultMonthlyLimit: 1000, noteKey: "ai.note.groq",
  }),
];

export function getAIProvider(id: string): AIProvider | null {
  return AI_PROVIDERS.find((p) => p.id === id) ?? null;
}
