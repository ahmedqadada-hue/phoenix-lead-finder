// Parsing and canonicalising public social-media profile URLs.
// Nothing here contacts a social network: it only interprets URLs found in
// search results, business websites or OpenStreetMap tags.

export type Platform =
  | "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube" | "x" | "snapchat" | "whatsapp";

export interface SocialRef {
  platform: Platform;
  handle: string;
  url: string;
}

const IG_RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts", "about", "developer", "legal", "directory", "web", "share", "challenge", "popular", "tags", "locations"]);
const FB_RESERVED = new Set(["sharer", "sharer.php", "share", "share.php", "tr", "plugins", "dialog", "login", "login.php", "groups", "events", "watch", "people", "help", "policies", "privacy", "hashtag", "photo", "photo.php", "story.php", "permalink.php", "marketplace", "gaming", "business", "ads", "l.php", "home.php", "reel", "videos", "public", "search", "2008", "media"]);
const X_RESERVED = new Set(["intent", "share", "home", "hashtag", "search", "i", "explore", "login", "signup", "settings", "privacy", "tos"]);
const YT_RESERVED = new Set(["watch", "embed", "results", "playlist", "shorts", "feed", "hashtag", "live", "t", "about", "premium", "gaming"]);

function clean(s: string) {
  try { s = decodeURIComponent(s); } catch { /* keep raw */ }
  return s.trim().replace(/^@/, "").toLowerCase();
}

export function parseSocialUrl(raw: string): SocialRef | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|web|l|ar-ar|en-gb|business)\./, "");
  const seg = u.pathname.split("/").filter(Boolean);

  if (host === "wa.me" || host === "api.whatsapp.com" || host === "whatsapp.com" || host === "chat.whatsapp.com") {
    if (host === "chat.whatsapp.com") return null; // group invites are not a business contact
    let num = host === "wa.me" ? (seg[0] ?? "") : (u.searchParams.get("phone") ?? "");
    num = num.replace(/\D/g, "");
    if (num.length < 8 || num.length > 15) return null;
    return { platform: "whatsapp", handle: num, url: `https://wa.me/${num}` };
  }
  if (host === "instagram.com" || host === "instagr.am") {
    const h = clean(seg[0] ?? "");
    if (!h || IG_RESERVED.has(h) || !/^[a-z0-9._]{1,30}$/.test(h)) return null;
    return { platform: "instagram", handle: h, url: `https://www.instagram.com/${h}/` };
  }
  if (host === "facebook.com" || host === "fb.com" || host === "fb.me") {
    const first = clean(seg[0] ?? "");
    if (!first) return null;
    if (first === "profile.php") {
      const id = u.searchParams.get("id");
      if (!id || !/^\d+$/.test(id)) return null;
      return { platform: "facebook", handle: id, url: `https://www.facebook.com/profile.php?id=${id}` };
    }
    if (first === "pages" || first === "p") {
      const last = seg[seg.length - 1] ?? "";
      const id = last.match(/(\d{6,})$/)?.[1];
      if (!id) return null;
      return { platform: "facebook", handle: id, url: `https://www.facebook.com/${id}` };
    }
    if (FB_RESERVED.has(first) || !/^[a-z0-9.\-_]{2,80}$/.test(first)) return null;
    return { platform: "facebook", handle: first, url: `https://www.facebook.com/${first}` };
  }
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    // Company pages only. Personal profiles (/in/) are deliberately ignored (data minimisation).
    const kind = (seg[0] ?? "").toLowerCase();
    if ((kind === "company" || kind === "school" || kind === "showcase") && seg[1]) {
      const h = clean(seg[1]);
      if (!h) return null;
      return { platform: "linkedin", handle: h, url: `https://www.linkedin.com/${kind}/${encodeURIComponent(h)}/` };
    }
    return null;
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const first = seg[0] ?? "";
    if (!first.startsWith("@")) return null;
    const h = clean(first);
    if (!/^[a-z0-9._]{2,30}$/.test(h)) return null;
    return { platform: "tiktok", handle: h, url: `https://www.tiktok.com/@${h}` };
  }
  if (host === "youtube.com") {
    const first = seg[0] ?? "";
    if (first.startsWith("@")) {
      const h = clean(first);
      if (!h) return null;
      return { platform: "youtube", handle: h, url: `https://www.youtube.com/@${h}` };
    }
    if ((first === "channel" || first === "c" || first === "user") && seg[1]) {
      const h = first === "channel" ? seg[1] : clean(seg[1]);
      return { platform: "youtube", handle: `${first}/${h}`, url: `https://www.youtube.com/${first}/${h}` };
    }
    if (!first || YT_RESERVED.has(first.toLowerCase())) return null;
    return null;
  }
  if (host === "twitter.com" || host === "x.com") {
    const h = clean(seg[0] ?? "");
    if (!h || X_RESERVED.has(h) || !/^[a-z0-9_]{1,15}$/.test(h)) return null;
    return { platform: "x", handle: h, url: `https://x.com/${h}` };
  }
  if (host === "snapchat.com") {
    if ((seg[0] === "add" || seg[0] === "@") && seg[1]) {
      const h = clean(seg[1]);
      return { platform: "snapchat", handle: h, url: `https://www.snapchat.com/add/${h}` };
    }
    if (seg[0]?.startsWith("@")) {
      const h = clean(seg[0]);
      return { platform: "snapchat", handle: h, url: `https://www.snapchat.com/add/${h}` };
    }
    return null;
  }
  return null;
}

export function isSocialHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return /(^|\.)(instagram\.com|facebook\.com|fb\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|snapchat\.com|wa\.me|whatsapp\.com|t\.me|pinterest\.com|threads\.net|threads\.com)$/.test(h);
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", tiktok: "TikTok",
  youtube: "YouTube", x: "X", snapchat: "Snapchat", whatsapp: "WhatsApp",
};
