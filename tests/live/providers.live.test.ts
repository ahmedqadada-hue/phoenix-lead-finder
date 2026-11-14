// LIVE tests: they call the real services. Run them on a machine with normal
// internet access:   npm run test:live
// OpenStreetMap needs no key. Web/AI providers are tested only when their key is
// supplied through environment variables (never commit keys).
import { describe, expect, it } from "vitest";
import { osm } from "@/lib/providers/search/osm";
import { brave, serper, tavily, youcom } from "@/lib/providers/search/web";
import { AI_PROVIDERS } from "@/lib/providers/ai/registry";
import { hitToCandidate } from "@/lib/discovery/candidates";
import { fetchSite } from "@/lib/discovery/website";

const req = { query: 'site:instagram.com "مطعم" "الرياض"', city: "الرياض", countryCode: "SA", industry: "cafes", language: "ar", limit: 15 };

describe("OpenStreetMap (live, no key)", () => {
  it("answers the connection test", async () => { await osm.test(null); }, 60000);
  it("returns real businesses with a source URL for a real city", async () => {
    const hits = await osm.search(req, null);
    console.log(`OpenStreetMap returned ${hits.length} cafes in Riyadh; first: ${hits[0]?.title} ${hits[0]?.url}`);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.url).toMatch(/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
    const cands = hits.map((h) => hitToCandidate(h, { provider: "osm", query: "live", city: "الرياض", country: "Saudi Arabia", industry: "cafes", category: "" })).filter(Boolean);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.some((c) => c!.website || c!.phone || c!.socials.length)).toBe(true);
  }, 120000);
});

describe("Business website reader (live)", () => {
  it("reads a public website and refuses private addresses", async () => {
    const site = await fetchSite("https://www.openstreetmap.org/");
    expect(site.ok).toBe(true);
    expect(site.titles.join(" ")).toMatch(/OpenStreetMap/i);
    expect((await fetchSite("http://127.0.0.1/")).ok).toBe(false);
  }, 60000);
});

const web: [string, typeof tavily, string | undefined][] = [["Tavily", tavily, process.env.TAVILY_API_KEY], ["Brave", brave, process.env.BRAVE_API_KEY], ["Serper", serper, process.env.SERPER_API_KEY], ["You.com", youcom, process.env.YOUCOM_API_KEY]];
for (const [name, provider, key] of web) {
  describe(`${name} (live)`, () => {
    it.skipIf(!key)("returns real search results", async () => {
      const hits = await provider.search(req, key!);
      console.log(`${name} returned ${hits.length} results; first: ${hits[0]?.url}`);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].url).toMatch(/^https?:\/\//);
    }, 60000);
  });
}

const ai: [number, string | undefined, string | undefined][] = [[0, process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL], [1, process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL], [2, process.env.GROQ_API_KEY, process.env.GROQ_MODEL]];
for (const [i, key, model] of ai) {
  const p = AI_PROVIDERS[i];
  describe(`${p.label} (live)`, () => {
    it.skipIf(!key)("lists models and answers a prompt", async () => {
      expect((await p.listModels(key!)).length).toBeGreaterThan(0);
      const out = await p.chat({ apiKey: key!, model: model || p.defaultModel, system: "Reply with the single word: ok", user: "ping" });
      expect(out.text.trim().length).toBeGreaterThan(0);
    }, 90000);
  });
}
