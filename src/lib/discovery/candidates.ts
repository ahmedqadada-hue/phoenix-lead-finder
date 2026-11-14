import type { SearchHit } from "../providers/search/types";
import { cleanTitleToName, getDomain, normalizePhone } from "./normalize";
import { parseSocialUrl, type SocialRef } from "./social";

export interface Candidate {
  name: string;
  city: string;
  country: string;
  industry: string;
  category: string;
  website: string | null;
  domain: string | null;
  phone: string | null;
  whatsapp: string | null;
  whatsappSource: string | null;
  description: string;
  socials: (SocialRef & { sourceUrl: string; verified: boolean })[];
  source: { provider: string; url: string; title: string; snippet: string; query: string; publishedAt: string | null };
  fromOsm: boolean;
}

// Hosts that describe businesses but are not themselves the business:
// news, directories, marketplaces, government, encyclopaedias, job boards.
const NON_BUSINESS = /(^|\.)(wikipedia\.org|wikimedia\.org|gov\.sa|gov\.ae|gov\.eg|gov\.[a-z]{2}|medium\.com|reddit\.com|quora\.com|pinterest\.com|threads\.net|threads\.com|telegram\.org|indeed\.com|bayt\.com|glassdoor\.com|wuzzuf\.net|naukrigulf\.com|crunchbase\.com|zoominfo\.com|yellowpages\.[a-z.]+|daleeli\.com|argaam\.com|sabq\.org|okaz\.com\.sa|alriyadh\.com|aleqt\.com|spa\.gov\.sa|alarabiya\.net|aljazeera\.net|bbc\.com|cnn\.com|reuters\.com|zawya\.com|arabnews\.com|saudigazette\.com\.sa|gulfnews\.com|khaleejtimes\.com|youm7\.com|almasryalyoum\.com|elwatannews\.com|opensooq\.com|haraj\.com\.sa|dubizzle\.com|olx\.[a-z.]+|timeoutriyadh\.com|timeoutdubai\.com|timeoutjeddah\.com|wikimapia\.org|trustpilot\.com|apple\.com|microsoft\.com|github\.com|archive\.org|scribd\.com|slideshare\.net|academia\.edu|researchgate\.net)$/i;

export function isNonBusinessHost(hostname: string): boolean {
  return NON_BUSINESS.test(hostname.toLowerCase().replace(/^www\./, ""));
}

export interface HitContext { provider: string; query: string; city: string; country: string; industry: string; category: string }

/** Converts one provider result into a candidate business, or null when the
 *  result cannot be attributed to a single identifiable business. Nothing is
 *  invented: every field comes from the hit itself. */
export function hitToCandidate(hit: SearchHit, ctx: HitContext): Candidate | null {
  const source = { provider: ctx.provider, url: hit.url, title: hit.title.slice(0, 300), snippet: hit.snippet.slice(0, 500), query: ctx.query, publishedAt: hit.publishedAt ?? null };
  const base = { country: ctx.country, industry: ctx.industry, category: ctx.category, source };

  if (hit.osm) {
    const o = hit.osm;
    const socials: Candidate["socials"] = [];
    for (const u of o.socialUrls) { const r = parseSocialUrl(u); if (r && r.platform !== "whatsapp") socials.push({ ...r, sourceUrl: hit.url, verified: false }); }
    const website = o.website && !parseSocialUrl(o.website) ? o.website : null;
    if (o.website && !website) { const r = parseSocialUrl(o.website); if (r && r.platform !== "whatsapp" && !socials.some((s) => s.platform === r.platform && s.handle === r.handle)) socials.push({ ...r, sourceUrl: hit.url, verified: false }); }
    const whatsapp = normalizePhone(o.whatsapp, ctx.country);
    return {
      ...base, name: o.name.trim().slice(0, 150), city: o.city || ctx.city, category: ctx.category || o.category || "",
      website, domain: getDomain(website), phone: normalizePhone(o.phone, ctx.country), whatsapp, whatsappSource: whatsapp ? hit.url : null,
      description: "", socials, fromOsm: true,
    };
  }

  const social = parseSocialUrl(hit.url);
  if (social) {
    if (social.platform === "whatsapp") return null;
    const name = cleanTitleToName(hit.title) || social.handle;
    return {
      ...base, name, city: ctx.city, website: null, domain: null, phone: null, whatsapp: null, whatsappSource: null,
      description: hit.snippet.slice(0, 500), socials: [{ ...social, sourceUrl: hit.url, verified: false }], fromOsm: false,
    };
  }

  let u: URL;
  try { u = new URL(hit.url); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (isNonBusinessHost(u.hostname)) return null;
  const domain = getDomain(hit.url);
  if (!domain) return null;
  const name = cleanTitleToName(hit.title) || domain;
  return {
    ...base, name, city: ctx.city, website: u.origin, domain, phone: null, whatsapp: null, whatsappSource: null,
    description: hit.snippet.slice(0, 500), socials: [], fromOsm: false,
  };
}

const SIGNAL_PATTERNS: { re: RegExp; title: { ar: string; en: string }; service: { ar: string; en: string } }[] = [
  { re: /(افتتاح\s+(ال)?فرع|فرعنا\s+الجديد|فرع\s+جديد|new\s+branch|second\s+branch|new\s+location)/i, title: { ar: "افتتاح فرع جديد", en: "New branch opening" }, service: { ar: "حملة إطلاق وفيديوهات قصيرة للفرع الجديد", en: "Launch campaign and short videos for the new branch" } },
  { re: /(افتتاح\s+قريب|قريب[اً]+\s+الافتتاح|الافتتاح\s+الكبير|opening\s+soon|grand\s+opening|coming\s+soon|now\s+open)/i, title: { ar: "افتتاح قريب أو حديث", en: "Opening soon / recently opened" }, service: { ar: "حملة تعريفية قبل وبعد الافتتاح", en: "Awareness campaign around the opening" } },
  { re: /(منتج\s+جديد|نطلق|إطلاق|اطلاق|new\s+product|product\s+launch|launching|new\s+collection|تشكيلة\s+جديدة)/i, title: { ar: "إطلاق منتج أو خدمة جديدة", en: "New product or service launch" }, service: { ar: "محتوى إبداعي وحملة إطلاق", en: "Creative content and a launch campaign" } },
  { re: /(هوية\s+جديدة|الهوية\s+الجديدة|rebrand|new\s+identity|new\s+look)/i, title: { ar: "تغيير الهوية البصرية", en: "Rebranding" }, service: { ar: "تصاميم وتطبيقات الهوية الجديدة", en: "Design work for the new identity" } },
  { re: /(مطلوب\s+مسو[ّ]?ق|وظيف[ةه]\s+تسويق|hiring\s+.*marketing|marketing\s+(manager|specialist)\s+(job|wanted|needed))/i, title: { ar: "توظيف في التسويق", en: "Hiring for marketing roles" }, service: { ar: "إدارة حسابات التواصل كخدمة خارجية", en: "Outsourced social media management" } },
];

export interface KeywordSignal { title: string; explanation: string; evidence: string; sourceUrl: string; suggestedService: string; publishedAt: string | null }

/** Rule-based opportunity hints. They quote real text from a real source and
 *  are always stored as LOW confidence + uncertain until a human or the AI confirms. */
export function keywordSignals(texts: { text: string; url: string; publishedAt?: string | null }[], locale: "ar" | "en" = "ar"): KeywordSignal[] {
  const out: KeywordSignal[] = [];
  const seen = new Set<number>();
  for (const t of texts) {
    SIGNAL_PATTERNS.forEach((p, idx) => {
      if (seen.has(idx)) return;
      const m = t.text.match(p.re);
      if (!m || m.index == null) return;
      seen.add(idx);
      const start = Math.max(0, m.index - 80), end = Math.min(t.text.length, m.index + m[0].length + 120);
      out.push({
        title: p.title[locale], suggestedService: p.service[locale], sourceUrl: t.url, publishedAt: t.publishedAt ?? null,
        evidence: t.text.slice(start, end).replace(/\s+/g, " ").trim(),
        explanation: locale === "ar" ? "عُثر على هذه العبارة في المصدر. لم تُؤكَّد بعد، راجع المصدر قبل الاعتماد عليها." : "This phrase was found in the source. Not yet confirmed — check the source before relying on it.",
      });
    });
  }
  return out;
}
