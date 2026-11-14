// Licensed web-search APIs. Each adapter performs a real HTTPS call with the
// administrator's own API key; none of them returns invented data.
import { apiFetch } from "../../ssrf";
import { failFromStatus, wrapNetwork, type SearchHit, type SearchProvider, type SearchRequest } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v : "");

export const tavily: SearchProvider = {
  id: "tavily", label: "Tavily", kind: "web", requiresKey: true,
  signupUrl: "https://app.tavily.com/", defaultMonthlyLimit: 900, noteKey: "prov.note.tavily",
  async search(req: SearchRequest, apiKey) {
    try {
      const res = await apiFetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query: req.query, max_results: Math.min(20, req.limit), search_depth: "basic" }),
      });
      if (!res.ok) await failFromStatus(res, "Tavily");
      const data = (await res.json()) as any;
      return (data.results ?? []).map((r: any): SearchHit => ({ title: str(r.title), url: str(r.url), snippet: str(r.content).slice(0, 500), publishedAt: r.published_date ?? null })).filter((h: SearchHit) => h.url);
    } catch (e) { wrapNetwork(e, "Tavily"); }
  },
  async test(apiKey) { await this.search({ query: "coffee shop", city: "", countryCode: "", industry: "", language: "en", limit: 1 }, apiKey); },
};

export const brave: SearchProvider = {
  id: "brave", label: "Brave Search", kind: "web", requiresKey: true,
  signupUrl: "https://api-dashboard.search.brave.com/", defaultMonthlyLimit: 900, noteKey: "prov.note.brave",
  async search(req: SearchRequest, apiKey) {
    try {
      const p = new URLSearchParams({ q: req.query, count: String(Math.min(20, req.limit)) });
      if (req.countryCode) p.set("country", req.countryCode);
      const res = await apiFetch(`https://api.search.brave.com/res/v1/web/search?${p}`, { headers: { accept: "application/json", "x-subscription-token": apiKey ?? "" } });
      if (!res.ok) await failFromStatus(res, "Brave");
      const data = (await res.json()) as any;
      return (data.web?.results ?? []).map((r: any): SearchHit => ({ title: str(r.title), url: str(r.url), snippet: str(r.description).replace(/<[^>]+>/g, "").slice(0, 500), publishedAt: r.page_age ?? null })).filter((h: SearchHit) => h.url);
    } catch (e) { wrapNetwork(e, "Brave"); }
  },
  async test(apiKey) { await this.search({ query: "coffee shop", city: "", countryCode: "", industry: "", language: "en", limit: 1 }, apiKey); },
};

export const serper: SearchProvider = {
  id: "serper", label: "Serper", kind: "web", requiresKey: true,
  signupUrl: "https://serper.dev/", defaultMonthlyLimit: 800, noteKey: "prov.note.serper",
  async search(req: SearchRequest, apiKey) {
    try {
      const body: Record<string, unknown> = { q: req.query, num: Math.min(20, req.limit) };
      if (req.countryCode) body.gl = req.countryCode.toLowerCase();
      if (req.language === "ar" || req.language === "en") body.hl = req.language;
      const res = await apiFetch("https://google.serper.dev/search", { method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey ?? "" }, body: JSON.stringify(body) });
      if (!res.ok) await failFromStatus(res, "Serper");
      const data = (await res.json()) as any;
      return (data.organic ?? []).map((r: any): SearchHit => ({ title: str(r.title), url: str(r.link), snippet: str(r.snippet).slice(0, 500), publishedAt: null })).filter((h: SearchHit) => h.url);
    } catch (e) { wrapNetwork(e, "Serper"); }
  },
  async test(apiKey) { await this.search({ query: "coffee shop", city: "", countryCode: "", industry: "", language: "en", limit: 1 }, apiKey); },
};

export const youcom: SearchProvider = {
  id: "youcom", label: "You.com", kind: "web", requiresKey: true,
  signupUrl: "https://you.com/platform", defaultMonthlyLimit: 2500, noteKey: "prov.note.youcom",
  async search(req: SearchRequest, apiKey) {
    try {
      const p = new URLSearchParams({ query: req.query, count: String(Math.min(20, req.limit)) });
      if (req.countryCode) p.set("country", req.countryCode);
      const res = await apiFetch(`https://api.ydc-index.io/v1/search?${p}`, { headers: { "x-api-key": apiKey ?? "" } });
      if (!res.ok) await failFromStatus(res, "You.com");
      const data = (await res.json()) as any;
      const list: any[] = data.results?.web ?? data.hits ?? [];
      return list.map((r: any): SearchHit => ({ title: str(r.title), url: str(r.url), snippet: (str(r.description) || (Array.isArray(r.snippets) ? r.snippets.join(" ") : "")).slice(0, 500), publishedAt: r.page_age ?? null })).filter((h: SearchHit) => h.url);
    } catch (e) { wrapNetwork(e, "You.com"); }
  },
  async test(apiKey) { await this.search({ query: "coffee shop", city: "", countryCode: "", industry: "", language: "en", limit: 1 }, apiKey); },
};
