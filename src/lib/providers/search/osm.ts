// OpenStreetMap (Overpass API). Free, no API key. Data © OpenStreetMap
// contributors, licensed under the Open Database License (ODbL), which permits
// storing the data provided attribution is given.
import { apiFetch, crawlerUserAgent } from "../../ssrf";
import { findIndustry } from "../../discovery/industries";
import { failFromStatus, ProviderError, wrapNetwork, type SearchHit, type SearchProvider, type SearchRequest } from "./types";

const ENDPOINT = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const CONTACT_KEYS = "^(website|contact:website|contact:instagram|contact:facebook|phone|contact:phone|contact:whatsapp|contact:mobile)$";

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");

export function buildOverpassQuery(city: string, countryCode: string, osmFilters: string[], limit: number): string {
  const name = reEscape(city.trim());
  const nameFilter = `[~"^name(:ar|:en)?$"~"^${name}$",i]`;
  const parts: string[] = [];
  for (const f of osmFilters) {
    const [k, v] = f.split("=");
    const sel = `["${k}"="${v}"]["name"][~"${CONTACT_KEYS}"~"."]`;
    parts.push(`nwr(area.a)${sel};`, `nwr(around.p:12000)${sel};`);
  }
  return `[out:json][timeout:60];
area["ISO3166-1"="${countryCode}"]["admin_level"="2"]->.c;
rel(area.c)["boundary"="administrative"]${nameFilter}->.r;
.r map_to_area->.a;
node(area.c)["place"~"^(city|town|suburb)$"]${nameFilter}->.p;
(${parts.join("")});
out tags center ${Math.max(1, Math.min(400, limit))};`;
}

export function osmElementToHit(el: any, city: string): SearchHit | null {
  const t = el?.tags ?? {};
  const name: string = t["name:ar"] || t.name || t["name:en"] || "";
  if (!name) return null;
  const socialUrls: string[] = [];
  const pushSocial = (base: string, v?: string) => {
    if (!v) return;
    const val = v.trim();
    socialUrls.push(/^https?:\/\//i.test(val) ? val : `${base}${val.replace(/^@/, "")}`);
  };
  pushSocial("https://www.instagram.com/", t["contact:instagram"]);
  pushSocial("https://www.facebook.com/", t["contact:facebook"]);
  pushSocial("https://www.tiktok.com/@", t["contact:tiktok"]);
  pushSocial("https://x.com/", t["contact:twitter"]);
  pushSocial("https://www.youtube.com/", t["contact:youtube"]);
  pushSocial("https://www.linkedin.com/company/", t["contact:linkedin"]);
  let website: string | undefined = t.website || t["contact:website"];
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  return {
    title: name,
    url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    snippet: [t.cuisine && `cuisine: ${t.cuisine}`, t["addr:street"], t["addr:city"]].filter(Boolean).join(" · "),
    osm: {
      name, city: t["addr:city"] || city, website, phone: t.phone || t["contact:phone"] || t["contact:mobile"],
      whatsapp: t["contact:whatsapp"], socialUrls, category: t.amenity || t.shop || t.office || t.tourism || t.leisure || "",
    },
  };
}

async function run(query: string): Promise<any> {
  try {
    const res = await apiFetch(ENDPOINT, {
      method: "POST", timeoutMs: 90000,
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": crawlerUserAgent() },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (res.status === 429 || res.status === 504) throw new ProviderError("RATE_LIMIT", `OpenStreetMap is busy (HTTP ${res.status})`);
    if (!res.ok) await failFromStatus(res, "OpenStreetMap");
    return await res.json();
  } catch (e) { wrapNetwork(e, "OpenStreetMap"); }
}

export const osm: SearchProvider = {
  id: "osm", label: "OpenStreetMap", kind: "places", requiresKey: false,
  signupUrl: "https://www.openstreetmap.org/copyright", defaultMonthlyLimit: 0, noteKey: "prov.note.osm",
  async search(req: SearchRequest) {
    const ind = findIndustry(req.industry);
    if (!ind || !ind.osm.length) throw new ProviderError("CONFIG", "OSM_INDUSTRY_UNSUPPORTED");
    if (!req.countryCode) throw new ProviderError("CONFIG", "OSM_COUNTRY_UNSUPPORTED");
    if (!req.city.trim()) throw new ProviderError("CONFIG", "OSM_CITY_REQUIRED");
    const data = await run(buildOverpassQuery(req.city, req.countryCode, ind.osm, req.limit));
    const hits: SearchHit[] = [];
    for (const el of data.elements ?? []) { const h = osmElementToHit(el, req.city); if (h) hits.push(h); }
    return hits;
  },
  async test() {
    const data = await run(`[out:json][timeout:10];node(1);out ids;`);
    if (!Array.isArray(data.elements)) throw new ProviderError("TEMPORARY", "Unexpected OpenStreetMap response");
  },
};
