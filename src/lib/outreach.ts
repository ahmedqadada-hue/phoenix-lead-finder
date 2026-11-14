import { normalizePhone } from "./discovery/normalize";
import { parseSocialUrl } from "./discovery/social";

export const LEAD_STATUSES = [
  "NEW", "QUALIFIED", "MESSAGE_READY", "CONTACT_OPENED", "SENT_MANUALLY", "REPLIED",
  "INTERESTED", "NOT_INTERESTED", "FOLLOW_UP", "CONVERTED", "DO_NOT_CONTACT",
] as const;
export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

/** Statuses that mean a human confirmed the message was actually sent. */
export const SENT_STATUSES: LeadStatusValue[] = ["SENT_MANUALLY", "REPLIED", "INTERESTED", "NOT_INTERESTED", "FOLLOW_UP", "CONVERTED"];

export function isValidStatus(s: string): s is LeadStatusValue {
  return (LEAD_STATUSES as readonly string[]).includes(s);
}

/** Opening a contact page only ever moves a lead forward to CONTACT_OPENED.
 *  It can never mark a message as sent: that needs the explicit "Mark as sent". */
export function statusAfterContactOpened(current: LeadStatusValue): LeadStatusValue {
  return current === "NEW" || current === "QUALIFIED" || current === "MESSAGE_READY" ? "CONTACT_OPENED" : current;
}

/** Builds a WhatsApp click-to-chat link with the message prefilled.
 *  The user still has to press Send inside WhatsApp. */
export function buildWhatsAppLink(number: string | null | undefined, message: string, country = ""): string | null {
  const n = normalizePhone(number, country);
  if (!n) return null;
  const text = message.trim();
  return text ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/${n}`;
}

const OPENABLE_HOSTS = /(^|\.)(instagram\.com|facebook\.com|linkedin\.com|tiktok\.com|youtube\.com|x\.com|snapchat\.com|wa\.me)$/;

/** Only canonical profile URLs on known platforms are ever opened from the outreach workspace. */
export function safeContactUrl(platform: string, url: string): string | null {
  const ref = parseSocialUrl(url);
  if (!ref || ref.platform !== platform) return null;
  try {
    const u = new URL(ref.url);
    if (u.protocol !== "https:" || !OPENABLE_HOSTS.test(u.hostname.replace(/^www\./, ""))) return null;
    return ref.url;
  } catch { return null; }
}

/** http(s) only; used for "open website" links rendered from stored data. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}
