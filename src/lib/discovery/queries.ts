import { findIndustry, findCountry } from "./industries";

export interface QuerySpec {
  query: string;
  kind: "social" | "web" | "signal";
  city: string;
}

export interface QueryInput {
  country: string;
  cities: string[];
  industry: string;
  category?: string;
  services?: string[];
  language: string; // "ar" | "en" | "both"
  targetCount: number;
}

const SIGNALS_AR = ["افتتاح قريب", "افتتاح فرع جديد", "قريباً", "الافتتاح الكبير", "منتج جديد", "هوية جديدة"];
const SIGNALS_EN = ["opening soon", "new branch", "grand opening", "now open", "new launch", "rebranding"];
const HIRING_AR = ["مطلوب مسوق", "وظيفة تسويق"];
const HIRING_EN = ["hiring marketing", "marketing manager job"];
const MARKETING_SERVICE = /(تسويق|سوشيال|إعلان|اعلان|محتوى|marketing|social|ads|content|seo|brand)/i;

const q = (s: string) => `"${s.replace(/"/g, "").trim()}"`;

/** Number of web-search queries worth spending for a requested candidate count.
 *  Each query usually yields a handful of usable businesses, never a guarantee. */
export function queryBudget(targetCount: number): number {
  return Math.min(40, Math.max(6, Math.ceil(targetCount / 4)));
}

export function generateQueries(input: QueryInput): QuerySpec[] {
  const ind = findIndustry(input.industry);
  const country = findCountry(input.country);
  const wantAr = input.language !== "en";
  const wantEn = input.language !== "ar";
  const termsAr = ind ? [...ind.termsAr] : [input.industry];
  const termsEn = ind ? [...ind.termsEn] : [input.industry];
  if (input.category?.trim()) { termsAr.unshift(input.category.trim()); termsEn.unshift(input.category.trim()); }
  const cities = input.cities.map((c) => c.trim()).filter(Boolean);
  const places = cities.length ? cities : [wantAr ? (country?.ar ?? input.country) : (country?.en ?? input.country)];
  const wantsMarketing = (input.services ?? []).some((s) => MARKETING_SERVICE.test(s));

  // Buckets are interleaved so a small budget still covers every city and query type.
  const buckets: QuerySpec[][] = [[], [], [], [], [], []];
  for (const city of places) {
    if (wantAr) {
      buckets[0].push({ query: `site:instagram.com ${q(termsAr[0])} ${q(city)}`, kind: "social", city });
      buckets[1].push({ query: `${q(termsAr[0])} ${q(city)} ${q(SIGNALS_AR[1])}`, kind: "signal", city });
      buckets[2].push({ query: `site:instagram.com ${q(termsAr[0])} ${q(city)} ${q(SIGNALS_AR[0])}`, kind: "signal", city });
      buckets[3].push({ query: `${termsAr[0]} ${city} الموقع الرسمي`, kind: "web", city });
      buckets[4].push({ query: `site:facebook.com ${q(termsAr[0])} ${q(city)}`, kind: "social", city });
      buckets[4].push({ query: `site:tiktok.com ${q(termsAr[0])} ${q(city)}`, kind: "social", city });
      for (const t of termsAr.slice(1)) buckets[5].push({ query: `site:instagram.com ${q(t)} ${q(city)}`, kind: "social", city });
      for (const s of SIGNALS_AR.slice(2)) buckets[5].push({ query: `${q(termsAr[0])} ${q(city)} ${q(s)}`, kind: "signal", city });
      if (wantsMarketing) for (const h of HIRING_AR) buckets[5].push({ query: `${q(h)} ${q(termsAr[0])} ${q(city)}`, kind: "signal", city });
    }
    if (wantEn) {
      buckets[0].push({ query: `site:instagram.com ${q(termsEn[0])} ${q(city)}`, kind: "social", city });
      buckets[1].push({ query: `${q(termsEn[0])} ${q(city)} ${q(SIGNALS_EN[1])}`, kind: "signal", city });
      buckets[2].push({ query: `site:linkedin.com/company/ ${q(termsEn[0])} ${q(city)}`, kind: "social", city });
      buckets[3].push({ query: `${termsEn[0]} ${city} official website`, kind: "web", city });
      buckets[4].push({ query: `site:facebook.com ${q(termsEn[0])} ${q(city)}`, kind: "social", city });
      for (const t of termsEn.slice(1)) buckets[5].push({ query: `site:instagram.com ${q(t)} ${q(city)}`, kind: "social", city });
      for (const s of [SIGNALS_EN[0], ...SIGNALS_EN.slice(2)]) buckets[5].push({ query: `${q(termsEn[0])} ${q(city)} ${q(s)}`, kind: "signal", city });
      if (wantsMarketing) for (const h of HIRING_EN) buckets[5].push({ query: `${q(h)} ${q(termsEn[0])} ${q(city)}`, kind: "signal", city });
    }
  }
  const seen = new Set<string>();
  const out: QuerySpec[] = [];
  for (const b of buckets) for (const spec of b) {
    if (seen.has(spec.query)) continue;
    seen.add(spec.query);
    out.push(spec);
  }
  return out.slice(0, queryBudget(input.targetCount));
}
