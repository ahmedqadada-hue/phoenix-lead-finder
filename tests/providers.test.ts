// Provider adapters tested against MOCKED HTTP responses (clearly labelled fixtures).
// The real services are exercised only by tests/live/*.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
const net = { down: false };
vi.mock("@/lib/ssrf", async (orig) => ({
  ...(await orig<typeof import("@/lib/ssrf")>()),
  apiFetch: async (...a: unknown[]) => { if (net.down) throw new Error("socket hang up"); return apiFetch(...a); },
}));

import { brave, serper, tavily, youcom } from "@/lib/providers/search/web";
import { buildOverpassQuery, osm, osmElementToHit } from "@/lib/providers/search/osm";
import { ProviderError } from "@/lib/providers/search/types";
import { AI_PROVIDERS } from "@/lib/providers/ai/registry";
import { SEARCH_PROVIDERS } from "@/lib/providers/search/registry";

const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
const req = { query: 'site:instagram.com "مطعم" "الرياض"', city: "الرياض", countryCode: "SA", industry: "restaurants", language: "ar", limit: 20 };

beforeEach(() => apiFetch.mockReset());

describe("web search adapters (mocked HTTP fixtures)", () => {
  it("Tavily: sends the key as a bearer token and maps results", async () => {
    apiFetch.mockResolvedValue(res(200, { results: [{ title: "FIXTURE Cafe", url: "https://fixture-cafe.example", content: "text", published_date: "2026-01-02" }, { title: "no url" }] }));
    const hits = await tavily.search(req, "tvly-KEY");
    expect(hits).toEqual([{ title: "FIXTURE Cafe", url: "https://fixture-cafe.example", snippet: "text", publishedAt: "2026-01-02" }]);
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(init.headers.authorization).toBe("Bearer tvly-KEY");
    expect(JSON.parse(init.body).query).toBe(req.query);
  });
  it("Brave: uses the subscription header and strips HTML from snippets", async () => {
    apiFetch.mockResolvedValue(res(200, { web: { results: [{ title: "FIXTURE", url: "https://fixture.example", description: "<strong>bold</strong> text" }] } }));
    const hits = await brave.search(req, "BSA-KEY");
    expect(hits[0].snippet).toBe("bold text");
    const [url, init] = apiFetch.mock.calls[0];
    expect(String(url)).toContain("https://api.search.brave.com/res/v1/web/search?q=");
    expect(String(url)).toContain("country=SA");
    expect(init.headers["x-subscription-token"]).toBe("BSA-KEY");
  });
  it("Serper and You.com map their own shapes", async () => {
    apiFetch.mockResolvedValue(res(200, { organic: [{ title: "FIXTURE", link: "https://fixture.example", snippet: "s" }] }));
    expect((await serper.search(req, "k"))[0].url).toBe("https://fixture.example");
    apiFetch.mockResolvedValue(res(200, { results: { web: [{ title: "FIXTURE", url: "https://fixture2.example", snippets: ["a", "b"] }] } }));
    expect((await youcom.search(req, "k"))[0]).toMatchObject({ url: "https://fixture2.example", snippet: "a b" });
  });
  it("classifies failures so only temporary ones are retried", async () => {
    const kind = async (status: number, body = "") => { apiFetch.mockResolvedValue(res(status, body)); return tavily.search(req, "k").catch((e) => e as ProviderError); };
    expect(await kind(401)).toMatchObject({ kind: "AUTH", retryable: false });
    expect(await kind(402)).toMatchObject({ kind: "QUOTA", retryable: false });
    expect(await kind(429, "rate limited")).toMatchObject({ kind: "RATE_LIMIT", retryable: true });
    expect(await kind(429, "monthly quota exceeded")).toMatchObject({ kind: "QUOTA" });
    expect(await kind(503)).toMatchObject({ kind: "TEMPORARY", retryable: true });
    expect(await kind(400)).toMatchObject({ kind: "BAD_REQUEST", retryable: false });
  });
  it("treats a dropped connection as a temporary, retryable failure", async () => {
    net.down = true;
    const netErr = await tavily.search(req, "k").catch((e) => e).finally(() => { net.down = false; });
    expect(netErr).toBeInstanceOf(ProviderError);
    expect(netErr.kind).toBe("TEMPORARY");
    expect(netErr.retryable).toBe(true);
  });
});

describe("OpenStreetMap provider", () => {
  it("builds a country-scoped, contact-filtered Overpass query and escapes input", () => {
    const q = buildOverpassQuery('Riy"adh (old)', "SA", ["amenity=restaurant"], 9999);
    expect(q).toContain('area["ISO3166-1"="SA"]');
    expect(q).toContain('["amenity"="restaurant"]["name"]');
    expect(q).toContain('Riy\\"adh \\(old\\)');
    expect(q).toContain("out tags center 400;");
  });
  it("maps an element with its source URL and never invents contacts", () => {
    const hit = osmElementToHit({ type: "node", id: 42, tags: { name: "FIXTURE Grill", "contact:instagram": "@fixturegrill", website: "fixturegrill.example", phone: "+966 11 000 0000", amenity: "restaurant" } }, "Riyadh")!;
    expect(hit.url).toBe("https://www.openstreetmap.org/node/42");
    expect(hit.osm).toMatchObject({ name: "FIXTURE Grill", website: "https://fixturegrill.example", socialUrls: ["https://www.instagram.com/fixturegrill"], whatsapp: undefined });
    expect(osmElementToHit({ type: "node", id: 1, tags: {} }, "x")).toBeNull();
  });
  it("needs no key, and reports configuration problems instead of guessing", async () => {
    expect(osm.requiresKey).toBe(false);
    await expect(osm.search({ ...req, industry: "ecommerce" }, null)).rejects.toMatchObject({ kind: "CONFIG", message: "OSM_INDUSTRY_UNSUPPORTED" });
    await expect(osm.search({ ...req, countryCode: "" }, null)).rejects.toMatchObject({ kind: "CONFIG" });
    apiFetch.mockResolvedValue(res(200, { elements: [{ type: "way", id: 7, tags: { name: "FIXTURE", phone: "+966110000000" } }] }));
    expect((await osm.search(req, null))[0].url).toBe("https://www.openstreetmap.org/way/7");
    apiFetch.mockResolvedValue(res(429, "busy"));
    await expect(osm.search(req, null)).rejects.toMatchObject({ kind: "RATE_LIMIT" });
  });
});

describe("AI provider adapter (mocked HTTP fixtures)", () => {
  it("offers OpenAI first and keeps the adapter list extensible", () => {
    expect(AI_PROVIDERS.map((p) => p.id)).toEqual(["openai", "gemini", "groq"]);
    expect(SEARCH_PROVIDERS.some((p) => p.kind === "web") && SEARCH_PROVIDERS.some((p) => p.kind === "places")).toBe(true);
  });
  it("calls chat completions with the server-side key and reads usage", async () => {
    apiFetch.mockResolvedValue(res(200, { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 11, completion_tokens: 5 } }));
    const out = await AI_PROVIDERS[0].chat({ apiKey: "sk-KEY", model: "m", system: "s", user: "u", json: true });
    expect(out).toEqual({ text: '{"ok":true}', inputTokens: 11, outputTokens: 5 });
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer sk-KEY");
    expect(JSON.parse(init.body)).toMatchObject({ model: "m", response_format: { type: "json_object" } });
  });
  it("lists models and surfaces an invalid key", async () => {
    apiFetch.mockResolvedValue(res(200, { data: [{ id: "gpt-x" }, { id: "whisper-1" }, { id: "o9-mini" }] }));
    expect(await AI_PROVIDERS[0].listModels("k")).toEqual(["gpt-x", "o9-mini"]);
    apiFetch.mockResolvedValue(res(401, "bad key"));
    await expect(AI_PROVIDERS[0].chat({ apiKey: "bad", model: "m", system: "s", user: "u" })).rejects.toMatchObject({ kind: "AUTH" });
  });
});
