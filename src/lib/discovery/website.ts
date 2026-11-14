import * as cheerio from "cheerio";
import { safeFetch } from "../ssrf";
import { parseSocialUrl, type SocialRef } from "./social";
import { normalizePhone } from "./normalize";

export interface SiteInfo {
  ok: boolean;
  finalUrl: string;
  titles: string[];
  siteName: string;
  description: string;
  logoUrl: string | null;
  socials: (SocialRef & { sourceUrl: string })[];
  phones: string[];
  textSample: string;
  error?: string;
}

/** Pure HTML → facts extraction (unit-tested with fixtures). */
export function extractSiteInfo(html: string, pageUrl: string, country = ""): Omit<SiteInfo, "ok" | "finalUrl" | "error"> {
  const $ = cheerio.load(html);
  const meta = (sel: string) => ($(sel).attr("content") ?? "").trim();
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  const siteName = meta('meta[property="og:site_name"]');
  const ogTitle = meta('meta[property="og:title"]');
  const description = (meta('meta[name="description"]') || meta('meta[property="og:description"]')).slice(0, 500);

  const socials = new Map<string, SocialRef & { sourceUrl: string }>();
  const phones = new Set<string>();
  const add = (href: string) => {
    let abs: string;
    try { abs = new URL(href, pageUrl).toString(); } catch { return; }
    const ref = parseSocialUrl(abs);
    if (ref) socials.set(`${ref.platform}:${ref.handle}`, { ...ref, sourceUrl: pageUrl });
  };
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href) return;
    if (href.toLowerCase().startsWith("tel:")) {
      const p = normalizePhone(href.slice(4), country);
      if (p) phones.add(p);
      return;
    }
    add(href);
  });
  // schema.org "sameAs" links
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walk = (n: any) => {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) return n.forEach(walk);
        const same = n.sameAs;
        (Array.isArray(same) ? same : same ? [same] : []).forEach((s: unknown) => typeof s === "string" && add(s));
        if (typeof n.telephone === "string") { const p = normalizePhone(n.telephone, country); if (p) phones.add(p); }
        Object.values(n).forEach(walk);
      };
      walk(JSON.parse($(el).text()));
    } catch { /* ignore malformed JSON-LD */ }
  });

  let logoUrl: string | null = null;
  const logoRaw = meta('meta[property="og:image"]') || $('link[rel="apple-touch-icon"]').attr("href") || $('link[rel~="icon"]').attr("href") || "";
  if (logoRaw) { try { const u = new URL(logoRaw, pageUrl); if (u.protocol === "https:") logoUrl = u.toString(); } catch { /* none */ } }

  $("script,style,noscript,svg,iframe").remove();
  const textSample = $("body").text().replace(/\s+/g, " ").trim().slice(0, 4000);

  return {
    titles: [title, siteName, ogTitle].filter(Boolean), siteName: siteName || ogTitle || title,
    description, logoUrl, socials: [...socials.values()], phones: [...phones], textSample,
  };
}

export function findContactLink(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  let found: string | null = null;
  $("a[href]").each((_, el) => {
    if (found) return;
    const text = $(el).text().toLowerCase();
    const href = $(el).attr("href") ?? "";
    if (/(contact|اتصل|تواصل)/i.test(text) || /contact/i.test(href)) {
      try {
        const u = new URL(href, pageUrl);
        if (u.hostname === new URL(pageUrl).hostname && u.toString() !== pageUrl && /^https?:$/.test(u.protocol)) found = u.toString();
      } catch { /* skip */ }
    }
  });
  return found;
}

/** Very small robots.txt check for our own user agent / wildcard. */
export function robotsAllows(robotsTxt: string, path: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
  let applies = false, sawSpecific = false;
  const rules: { allow: boolean; path: string; specific: boolean }[] = [];
  let curSpecific = false;
  for (const line of lines) {
    const m = line.match(/^([a-zA-Z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") {
      const ua = v.toLowerCase();
      curSpecific = ua.includes("phoenixleadfinder");
      applies = ua === "*" || curSpecific;
      if (curSpecific) sawSpecific = true;
    } else if (applies && (k === "disallow" || k === "allow") && v) rules.push({ allow: k === "allow", path: v, specific: curSpecific });
  }
  const active = rules.filter((r) => r.specific === sawSpecific);
  let best: { allow: boolean; len: number } | null = null;
  for (const r of active) {
    const pat = r.path.replace(/\*.*$/, "");
    if (path.startsWith(pat) && (!best || pat.length > best.len)) best = { allow: r.allow, len: pat.length };
  }
  return best ? best.allow : true;
}

/** Reads a business's own public website (home page + one contact page). */
export async function fetchSite(url: string, country = ""): Promise<SiteInfo> {
  const empty: SiteInfo = { ok: false, finalUrl: url, titles: [], siteName: "", description: "", logoUrl: null, socials: [], phones: [], textSample: "" };
  try {
    const origin = new URL(url).origin;
    try {
      const robots = await safeFetch(`${origin}/robots.txt`, { maxBytes: 200_000, timeoutMs: 6000, accept: "text/plain" });
      if (robots.status === 200 && !robotsAllows(robots.text, new URL(url).pathname || "/")) return { ...empty, error: "ROBOTS_DISALLOWED" };
    } catch { /* no robots.txt: allowed */ }
    const res = await safeFetch(url);
    if (res.status >= 400) return { ...empty, finalUrl: res.url, error: `HTTP_${res.status}` };
    if (!/html/i.test(res.contentType)) return { ...empty, finalUrl: res.url, error: "NOT_HTML" };
    const info = extractSiteInfo(res.text, res.url, country);
    if (!info.socials.length) {
      const contact = findContactLink(res.text, res.url);
      if (contact) {
        try {
          const c = await safeFetch(contact);
          if (c.status < 400 && /html/i.test(c.contentType)) {
            const extra = extractSiteInfo(c.text, c.url, country);
            info.socials.push(...extra.socials);
            for (const p of extra.phones) if (!info.phones.includes(p)) info.phones.push(p);
          }
        } catch { /* contact page is optional */ }
      }
    }
    return { ok: true, finalUrl: res.url, ...info };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message.slice(0, 200) : "FETCH_FAILED" };
  }
}
