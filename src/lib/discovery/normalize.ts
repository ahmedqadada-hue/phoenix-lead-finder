// Normalisation helpers used for de-duplication and identity checks.

const GENERIC_WORDS = new Set([
  "مطعم", "مطاعم", "شركه", "مؤسسه", "مجموعه", "كافيه", "مقهي", "كوفي", "متجر", "محل", "مركز", "عياده", "صالون",
  "restaurant", "restaurants", "cafe", "coffee", "company", "co", "llc", "ltd", "inc", "est", "group", "the", "store", "shop",
  "official", "الرسمي", "الحساب", "ksa", "saudi", "uae", "egypt",
]);

export function normalizeArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, "") // diacritics + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

export function normalizeName(name: string): string {
  const base = normalizeArabic(name.toLowerCase())
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = base.split(" ").filter((t) => t && !GENERIC_WORDS.has(t) && t !== "and");
  // If everything was generic keep the base so two different businesses never collapse to "".
  return (tokens.length ? tokens.join(" ") : base).trim();
}

export function normalizeCity(city: string): string {
  return normalizeArabic(city.toLowerCase()).replace(/[^\p{L}\p{N}]/gu, "");
}

const TWO_LEVEL_TLDS = new Set([
  "com.sa", "net.sa", "org.sa", "edu.sa", "med.sa", "com.eg", "net.eg", "org.eg", "co.uk", "org.uk", "com.au", "co.nz",
  "com.kw", "com.qa", "com.bh", "com.om", "com.jo", "com.lb", "com.tr", "co.ma", "com.ly", "com.iq", "co.in", "com.pk",
  "com.my", "com.sg", "co.za", "com.br", "com.mx", "co.il", "co.jp", "com.cn", "com.ae", "net.ae", "org.ae", "co.ae",
]);

// Hosts where many unrelated businesses share one registrable domain.
const SHARED_SUBDOMAIN_HOSTS = ["wixsite.com", "myshopify.com", "blogspot.com", "wordpress.com", "salla.sa", "zid.store", "webflow.io", "square.site", "weebly.com", "godaddysites.com", "mystrikingly.com", "carrd.co", "netlify.app", "vercel.app", "github.io", "odoo.com", "youcan.shop", "expandcart.com"];
const SHARED_PATH_HOSTS = ["linktr.ee", "sites.google.com", "business.site", "g.page", "goo.gl", "bit.ly", "taplink.cc", "beacons.ai", "linkin.bio", "bio.link", "maps.app.goo.gl", "google.com", "apple.com", "apps.apple.com", "play.google.com", "talabat.com", "hungerstation.com", "jahez.net", "tripadvisor.com", "foursquare.com", "yelp.com", "zomato.com", "booking.com", "noon.com", "amazon.sa", "amazon.ae", "amazon.eg", "amazon.com", "salla.com", "zid.sa", "t.me", "tinyurl.com"];

/** Returns the identity domain of a business website, or null when the URL
 *  lives on a shared host and therefore cannot identify a single business. */
export function getDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
  } catch { return null; }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) return null;
  for (const s of SHARED_PATH_HOSTS) if (host === s || host.endsWith(`.${s}`)) return null;
  for (const s of SHARED_SUBDOMAIN_HOSTS) {
    if (host === s) return null;
    if (host.endsWith(`.${s}`)) return host; // keep full sub-domain: it is the identity
  }
  const parts = host.split(".");
  const last2 = parts.slice(-2).join(".");
  if (TWO_LEVEL_TLDS.has(last2)) return parts.length >= 3 ? parts.slice(-3).join(".") : null;
  return last2;
}

/** Turns a search-result title into a probable business name. */
export function cleanTitleToName(title: string): string {
  let t = (title || "").replace(/\s+/g, " ").trim();
  const ig = t.match(/^(.*?)\s*\(@[^)]+\)/);
  if (ig && ig[1]) t = ig[1];
  t = t.replace(/\s*[•·|–—-]\s*(instagram|facebook|linkedin|tiktok|youtube|x|twitter)\b.*$/i, "");
  t = t.replace(/\s*\|\s*(instagram|facebook|linkedin|tiktok)\s*$/i, "");
  t = t.replace(/\s*-\s*(home|الرئيسية|الصفحة الرئيسية)\s*$/i, "");
  const parts = t.split(/\s+[|•·–—]\s+|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length) t = parts[0];
  t = t.replace(/^(home|welcome to|الرئيسية|مرحبا بكم في)\s*[:\-|]?\s*/i, "");
  return t.replace(/[‎‏]/g, "").trim().slice(0, 120);
}

const DIAL: Record<string, string> = {
  "saudi arabia": "966", "السعودية": "966", "المملكة العربية السعودية": "966", ksa: "966",
  "united arab emirates": "971", uae: "971", "الإمارات": "971", "الامارات": "971",
  egypt: "20", "مصر": "20", kuwait: "965", "الكويت": "965", qatar: "974", "قطر": "974",
  bahrain: "973", "البحرين": "973", oman: "968", "عمان": "968", "سلطنة عمان": "968",
  jordan: "962", "الأردن": "962", "الاردن": "962", lebanon: "961", "لبنان": "961",
  iraq: "964", "العراق": "964", morocco: "212", "المغرب": "212", algeria: "213", "الجزائر": "213",
  tunisia: "216", "تونس": "216", libya: "218", "ليبيا": "218", sudan: "249", "السودان": "249",
  yemen: "967", "اليمن": "967", syria: "963", "سوريا": "963", palestine: "970", "فلسطين": "970",
  turkey: "90", "تركيا": "90", "united kingdom": "44", uk: "44", "united states": "1", usa: "1",
};

export function dialCode(country: string): string | null {
  return DIAL[country.trim().toLowerCase()] ?? null;
}

/** Normalises a phone number to international digits (no "+"), or null if it
 *  cannot be made into a plausible E.164 number. Never guesses a country code
 *  that was not supplied. */
export function normalizePhone(raw: string | null | undefined, country = ""): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const plus = s.startsWith("+");
  s = s.replace(/\D/g, "");
  if (!s) return null;
  if (plus) { /* already international */ }
  else if (s.startsWith("00")) s = s.slice(2);
  else if (s.startsWith("0")) {
    const cc = dialCode(country);
    if (!cc) return null;
    s = cc + s.replace(/^0+/, "");
  } else {
    const cc = dialCode(country);
    if (cc && !s.startsWith(cc) && s.length <= 10) s = cc + s;
    else if (!cc && s.length <= 10) return null;
  }
  if (s.length < 8 || s.length > 15 || s.startsWith("0")) return null;
  return s;
}
