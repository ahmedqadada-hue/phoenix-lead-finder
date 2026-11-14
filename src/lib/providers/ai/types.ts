import { apiFetch } from "../../ssrf";
import { failFromStatus, wrapNetwork } from "../search/types";

export interface ChatRequest {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  json?: boolean;
}

export interface ChatResult { text: string; inputTokens: number; outputTokens: number }

export interface AIProvider {
  id: string;
  label: string;
  signupUrl: string;
  defaultModel: string;
  defaultMonthlyLimit: number; // AI tasks per month, 0 = no cap
  noteKey: string;
  chat(req: ChatRequest): Promise<ChatResult>;
  listModels(apiKey: string): Promise<string[]>;
}

/** Adapter for any service exposing the OpenAI-compatible Chat Completions API.
 *  New providers are added by declaring one more instance. */
export function openAICompatible(cfg: { id: string; label: string; baseUrl: string; signupUrl: string; defaultModel: string; defaultMonthlyLimit: number; noteKey: string; modelFilter?: RegExp }): AIProvider {
  return {
    id: cfg.id, label: cfg.label, signupUrl: cfg.signupUrl, defaultModel: cfg.defaultModel, defaultMonthlyLimit: cfg.defaultMonthlyLimit, noteKey: cfg.noteKey,
    async chat(req) {
      try {
        const body: Record<string, unknown> = {
          model: req.model,
          messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
        };
        if (req.json) body.response_format = { type: "json_object" };
        const res = await apiFetch(`${cfg.baseUrl}/chat/completions`, {
          method: "POST", timeoutMs: 90000,
          headers: { "content-type": "application/json", authorization: `Bearer ${req.apiKey}` },
          body: JSON.stringify(body),
        });
        if (!res.ok) await failFromStatus(res, cfg.label);
        const data = (await res.json()) as any;
        return {
          text: String(data.choices?.[0]?.message?.content ?? ""),
          inputTokens: Number(data.usage?.prompt_tokens ?? 0),
          outputTokens: Number(data.usage?.completion_tokens ?? 0),
        };
      } catch (e) { wrapNetwork(e, cfg.label); }
    },
    async listModels(apiKey) {
      try {
        const res = await apiFetch(`${cfg.baseUrl}/models`, { headers: { authorization: `Bearer ${apiKey}` } });
        if (!res.ok) await failFromStatus(res, cfg.label);
        const data = (await res.json()) as any;
        const ids: string[] = (data.data ?? []).map((m: any) => String(m.id ?? "").replace(/^models\//, "")).filter(Boolean);
        return (cfg.modelFilter ? ids.filter((i) => cfg.modelFilter!.test(i)) : ids).sort();
      } catch (e) { wrapNetwork(e, cfg.label); }
    },
  };
}
