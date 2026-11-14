import { describe, expect, it } from "vitest";
import { generateQueries, queryBudget } from "@/lib/discovery/queries";
import { parseSocialUrl } from "@/lib/discovery/social";
import { cleanTitleToName, getDomain, normalizeName, normalizePhone } from "@/lib/discovery/normalize";
import { findDuplicate, matchReason } from "@/lib/discovery/dedupe";
import { computeVerification, nameConsistent } from "@/lib/discovery/verify";
import { hitToCandidate, keywordSignals } from "@/lib/discovery/candidates";
import { extractSiteInfo, findContactLink, robotsAllows } from "@/lib/discovery/website";
import { INDUSTRIES } from "@/lib/discovery/industries";

describe("search query generation", () => {
  const base = { country: "Saudi Arabia", cities: ["الرياض", "جدة"], industry: "restaurants", services: ["Social Media Management"], language: "ar", targetCount: 100 };
  it("adapts to industry, city and language", () => {
    const qs = generateQueries(base);
    expect(qs.length).toBeGreaterThan(5);
    expect(qs.some((q) => q.query.includes("site:instagram.com") && q.query.includes("مطعم") && q.query.includes("الرياض"))).toBe(true);
    expect(qs.some((q) => q.query.includes("جدة"))).toBe(true);
    expect(qs.some((q) => q.kind === "signal" && q.query.includes("افتتاح"))).toBe(true);
    expect(qs.every((q) => !/restaurant/.test(q.query))).toBe(true);
  });
  it("produces English and LinkedIn queries for English campaigns", () => {
    const qs = generateQueries({ ...base, cities: ["Dubai"], country: "United Arab Emirates", industry: "realestate", language: "en" });
    expect(qs.some((q) => q.query.includes("site:linkedin.com/company/") && q.query.includes("real estate"))).toBe(true);
    expect(qs.every((q) => !/[؀-ۿ]/.test(q.query))).toBe(true);
  });
  it("is deduplicated, deterministic and bounded by the budget", () => {
    const a = generateQueries(base), b = generateQueries(base);
    expect(a).toEqual(b);
    expect(new Set(a.map((q) => q.query)).size).toBe(a.length);
    expect(a.length).toBeLessThanOrEqual(queryBudget(100));
    expect(generateQueries({ ...base, targetCount: 5 }).length).toBeLessThanOrEqual(6);
  });
  it("accepts free-text industries and never mutates the catalogue", () => {
    const before = JSON.stringify(INDUSTRIES);
    const qs = generateQueries({ ...base, industry: "مغاسل سيارات", category: "تلميع" });
    expect(qs.some((q) => q.query.includes("تلميع"))).toBe(true);
    generateQueries({ ...base, category: "برجر" });
    expect(JSON.stringify(INDUSTRIES)).toBe(before);
  });
});

describe("social profile URL parsing", () => {
  it("canonicalises business profiles", () => {
    expect(parseSocialUrl("https://www.instagram.com/Some.Cafe/?hl=ar")).toEqual({ platform: "instagram", handle: "some.cafe", url: "https://www.instagram.com/some.cafe/" });
    expect(parseSocialUrl("https://www.instagram.com/some.cafe/p/ABC123/")?.handle).toBe("some.cafe");
    expect(parseSocialUrl("https://m.facebook.com/SomeCafeKSA")?.handle).toBe("somecafeksa");
    expect(parseSocialUrl("https://www.linkedin.com/company/some-co/about/")?.platform).toBe("linkedin");
    expect(parseSocialUrl("https://www.tiktok.com/@some_cafe")?.handle).toBe("some_cafe");
    expect(parseSocialUrl("https://youtube.com/@somecafe")?.platform).toBe("youtube");
    expect(parseSocialUrl("https://wa.me/966500000000")?.handle).toBe("966500000000");
    expect(parseSocialUrl("https://api.whatsapp.com/send?phone=+966 50 000 0000")?.url).toBe("https://wa.me/966500000000");
  });
  it("rejects posts, share links, personal LinkedIn profiles and non-social URLs", () => {
    for (const u of ["https://www.instagram.com/p/ABC/", "https://www.instagram.com/explore/tags/x/", "https://www.facebook.com/sharer/sharer.php?u=x", "https://www.linkedin.com/in/someone/", "https://twitter.com/intent/tweet?text=x", "https://example.com/instagram", "javascript:alert(1)", "https://chat.whatsapp.com/abc", "https://wa.me/123"]) {
      expect(parseSocialUrl(u), u).toBeNull();
    }
  });
});

describe("lead normalisation", () => {
  it("normalises Arabic and Latin names", () => {
    expect(normalizeName("مَطْعَم البَيْت")).toBe(normalizeName("مطعم البيت"));
    expect(normalizeName("مطعم الأصالة")).toBe(normalizeName("الاصاله"));
    expect(normalizeName("Al Baik Restaurant Co.")).toBe("al baik");
    expect(normalizeName("مطعم")).toBe("مطعم"); // never collapses to empty
  });
  it("extracts identity domains and refuses shared hosts", () => {
    expect(getDomain("https://www.example.com.sa/menu")).toBe("example.com.sa");
    expect(getDomain("https://shop.example.com")).toBe("example.com");
    expect(getDomain("https://mystore.salla.sa")).toBe("mystore.salla.sa");
    expect(getDomain("https://linktr.ee/somecafe")).toBeNull();
    expect(getDomain("https://sites.google.com/view/x")).toBeNull();
    expect(getDomain("not a url")).toBeNull();
  });
  it("cleans search titles into names", () => {
    expect(cleanTitleToName("Some Cafe | سم كافيه (@some.cafe) • Instagram photos and videos")).toBe("Some Cafe");
    expect(cleanTitleToName("مطعم البيت - الرئيسية")).toBe("مطعم البيت");
    expect(cleanTitleToName("Acme Realty | LinkedIn")).toBe("Acme Realty");
  });
  it("normalises phones without guessing a country", () => {
    expect(normalizePhone("050 123 4567", "Saudi Arabia")).toBe("966501234567");
    expect(normalizePhone("+971 4 123 4567")).toBe("97141234567");
    expect(normalizePhone("00966501234567")).toBe("966501234567");
    expect(normalizePhone("٠٥٠١٢٣٤٥٦٧", "السعودية")).toBe("966501234567");
    expect(normalizePhone("0501234567", "")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("duplicate detection", () => {
  const a = { normalizedName: "al bait", city: "Riyadh", domain: "albait.example", socials: [{ platform: "instagram", handle: "albait" }] };
  it("matches on domain, on verified social handle, and on name + city", () => {
    expect(matchReason(a, { ...a, normalizedName: "other", socials: [] })).toBe("DOMAIN");
    expect(matchReason(a, { normalizedName: "x", city: "", domain: null, socials: [{ platform: "instagram", handle: "albait" }] })).toBe("SOCIAL");
    expect(matchReason({ ...a, domain: null, socials: [] }, { normalizedName: "al bait", city: "riyadh", domain: null, socials: [] })).toBe("NAME_CITY");
  });
  it("does not merge unrelated businesses that merely share a name", () => {
    expect(matchReason({ ...a, domain: null, socials: [] }, { normalizedName: "al bait", city: "Jeddah", domain: null, socials: [] })).toBeNull();
    expect(matchReason(a, { normalizedName: "al bait", city: "Riyadh", domain: "other-albait.example", socials: [] })).toBeNull();
    expect(matchReason({ ...a, domain: null }, { normalizedName: "al bait", city: "Riyadh", domain: null, socials: [{ platform: "instagram", handle: "albait.jeddah" }] })).toBeNull();
    expect(matchReason({ normalizedName: "al bait", city: "", domain: null, socials: [] }, { normalizedName: "al bait", city: "", domain: null, socials: [] })).toBeNull();
  });
  it("ignores shared WhatsApp numbers", () => {
    const w = [{ platform: "whatsapp", handle: "966500000000" }];
    expect(matchReason({ normalizedName: "a", city: "x", domain: null, socials: w }, { normalizedName: "b", city: "x", domain: null, socials: w })).toBeNull();
  });
  it("finds the first duplicate in a list", () => {
    expect(findDuplicate(a, [{ id: "1", normalizedName: "z", city: "", domain: null, socials: [] }, { id: "2", ...a }])?.match.id).toBe("2");
  });
});

describe("profile / identity verification", () => {
  const base = { name: "Al Bait Restaurant", domain: "albait.example", websiteFetched: true, siteTitles: ["Al Bait | Authentic food"], socialsFromWebsite: 2, hasOsmRecord: false, independentSources: 1, socialsFromSearchOnly: 0 };
  it("VERIFIED needs a consistent official site that links its own accounts", () => {
    expect(computeVerification(base).status).toBe("VERIFIED");
    expect(computeVerification({ ...base, socialsFromWebsite: 0 }).status).toBe("LIKELY");
    expect(computeVerification({ ...base, siteTitles: ["Totally different shop"], domain: "zzz.example" }).status).toBe("UNVERIFIED");
  });
  it("search-only profiles stay UNVERIFIED", () => {
    const r = computeVerification({ ...base, domain: null, websiteFetched: false, siteTitles: [], socialsFromWebsite: 0, socialsFromSearchOnly: 1 });
    expect(r.status).toBe("UNVERIFIED");
    expect(r.notes).toContain("SOCIALS_FROM_SEARCH_ONLY");
  });
  it("uses the domain when the title is unhelpful", () => {
    expect(nameConsistent("Albait", ["Home"], "albait.example")).toBe(true);
    expect(nameConsistent("Albait", ["Home"], "other.example")).toBe(false);
  });
});

describe("search hit → candidate", () => {
  const ctx = { provider: "tavily", query: "q", city: "الرياض", country: "Saudi Arabia", industry: "restaurants", category: "" };
  it("keeps the source for every social link", () => {
    const c = hitToCandidate({ title: "Demo Cafe (@demo.cafe) • Instagram photos and videos", url: "https://www.instagram.com/demo.cafe/", snippet: "قهوة مختصة في الرياض" }, ctx)!;
    expect(c.name).toBe("Demo Cafe");
    expect(c.socials).toEqual([{ platform: "instagram", handle: "demo.cafe", url: "https://www.instagram.com/demo.cafe/", sourceUrl: "https://www.instagram.com/demo.cafe/", verified: false }]);
    expect(c.website).toBeNull();
  });
  it("drops news, directories and shared hosts instead of inventing a business", () => {
    for (const url of ["https://ar.wikipedia.org/wiki/x", "https://www.tripadvisor.com/Restaurant-x", "https://www.argaam.com/ar/article/1", "https://linktr.ee/x", "ftp://example.com/x"]) {
      expect(hitToCandidate({ title: "t", url, snippet: "" }, ctx), url).toBeNull();
    }
  });
  it("maps OpenStreetMap records with their contact tags", () => {
    const c = hitToCandidate({ title: "Demo", url: "https://www.openstreetmap.org/node/1", snippet: "", osm: { name: "Demo Grill", city: "Riyadh", website: "https://demogrill.example", phone: "011 123 4567", whatsapp: "+966501234567", socialUrls: ["https://www.instagram.com/demogrill"] } }, { ...ctx, provider: "osm" })!;
    expect(c.domain).toBe("demogrill.example");
    expect(c.whatsapp).toBe("966501234567");
    expect(c.whatsappSource).toBe("https://www.openstreetmap.org/node/1");
    expect(c.socials[0].sourceUrl).toBe("https://www.openstreetmap.org/node/1");
    expect(c.fromOsm).toBe(true);
  });
});

describe("keyword opportunity hints", () => {
  it("quotes real evidence and its source", () => {
    const s = keywordSignals([{ text: "يسعدنا الإعلان عن افتتاح فرعنا الجديد في حي الملقا الأسبوع القادم", url: "https://demo.example/news" }], "ar");
    expect(s).toHaveLength(1);
    expect(s[0].sourceUrl).toBe("https://demo.example/news");
    expect(s[0].evidence).toContain("فرعنا الجديد");
  });
  it("returns nothing when there is no evidence", () => {
    expect(keywordSignals([{ text: "قائمة الطعام وساعات العمل", url: "https://demo.example" }], "ar")).toEqual([]);
  });
});

describe("official website reading", () => {
  const html = `<html><head><title>Demo Grill | Home</title><meta property="og:site_name" content="Demo Grill"><meta name="description" content="Grilled food in Riyadh">
  <script type="application/ld+json">{"@type":"Restaurant","sameAs":["https://www.tiktok.com/@demogrill"],"telephone":"+966 11 123 4567"}</script></head>
  <body><a href="https://www.instagram.com/demogrill/">IG</a><a href="https://wa.me/966501234567?text=hi">WhatsApp</a><a href="/contact-us">اتصل بنا</a>
  <a href="https://www.instagram.com/p/XYZ/">a post</a><a href="tel:+966111234567">call</a><script>ignore()</script><p>نعلن عن افتتاح فرعنا الجديد</p></body></html>`;
  it("extracts official accounts with the page as their source", () => {
    const info = extractSiteInfo(html, "https://demogrill.example/", "Saudi Arabia");
    expect(info.siteName).toBe("Demo Grill");
    expect(info.socials.map((s) => s.platform).sort()).toEqual(["instagram", "tiktok", "whatsapp"]);
    expect(info.socials.every((s) => s.sourceUrl === "https://demogrill.example/")).toBe(true);
    expect(info.phones).toContain("966111234567");
    expect(info.textSample).toContain("افتتاح فرعنا الجديد");
    expect(info.textSample).not.toContain("ignore()");
  });
  it("finds a same-site contact page only", () => {
    expect(findContactLink(html, "https://demogrill.example/")).toBe("https://demogrill.example/contact-us");
    expect(findContactLink(`<a href="https://evil.example/contact">Contact</a>`, "https://demogrill.example/")).toBeNull();
  });
  it("respects robots.txt", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /", "/")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /admin", "/")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /\n\nUser-agent: PhoenixLeadFinder\nAllow: /", "/")).toBe(true);
    expect(robotsAllows("", "/")).toBe(true);
  });
});
