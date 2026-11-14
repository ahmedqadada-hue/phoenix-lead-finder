import { normalizeCity } from "./normalize";

export interface IdentityKeys {
  id?: string;
  normalizedName: string;
  city: string;
  domain: string | null;
  socials: { platform: string; handle: string }[];
}

export type DuplicateReason = "DOMAIN" | "SOCIAL" | "NAME_CITY";

/** Decides whether two business records describe the same business.
 *  Deliberately conservative: a shared name alone is never enough. */
export function matchReason(a: IdentityKeys, b: IdentityKeys): DuplicateReason | null {
  if (a.domain && b.domain && a.domain === b.domain) return "DOMAIN";
  for (const s of a.socials) {
    if (s.platform === "whatsapp") continue; // call-centre numbers can be shared between brands
    if (b.socials.some((o) => o.platform === s.platform && o.handle === s.handle)) return "SOCIAL";
  }
  // Conflicting hard identifiers mean different businesses even if the names agree.
  if (a.domain && b.domain && a.domain !== b.domain) return null;
  for (const s of a.socials) {
    if (s.platform === "whatsapp") continue;
    const other = b.socials.find((o) => o.platform === s.platform);
    if (other && other.handle !== s.handle) return null;
  }
  const ca = normalizeCity(a.city), cb = normalizeCity(b.city);
  if (a.normalizedName && a.normalizedName.length >= 3 && a.normalizedName === b.normalizedName && ca && ca === cb) return "NAME_CITY";
  return null;
}

export function findDuplicate<T extends IdentityKeys>(candidate: IdentityKeys, existing: T[]): { match: T; reason: DuplicateReason } | null {
  for (const e of existing) {
    const reason = matchReason(candidate, e);
    if (reason) return { match: e, reason };
  }
  return null;
}
