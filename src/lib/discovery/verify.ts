import { normalizeName } from "./normalize";

export type VerificationStatus = "VERIFIED" | "LIKELY" | "UNVERIFIED";

export interface VerificationInput {
  name: string;
  domain: string | null;
  websiteFetched: boolean;
  siteTitles: string[];           // <title>, og:site_name, og:title of the official site
  socialsFromWebsite: number;     // social/WhatsApp links found on the official site
  hasOsmRecord: boolean;
  independentSources: number;     // distinct providers that returned this business
  socialsFromSearchOnly: number;
}

/** True when the business name is consistent with what its website says about itself. */
export function nameConsistent(name: string, siteTitles: string[], domain: string | null): boolean {
  const n = normalizeName(name);
  if (!n) return false;
  const tokens = n.split(" ").filter((t) => t.length >= 3);
  if (!tokens.length) return false;
  const hay = normalizeName(siteTitles.join(" "));
  const hits = tokens.filter((t) => hay.includes(t)).length;
  if (hits >= Math.max(1, Math.ceil(tokens.length / 2))) return true;
  if (domain) {
    const d = domain.split(".")[0].replace(/[^a-z0-9]/g, "");
    const compact = n.replace(/[^a-z0-9]/g, "");
    if (compact.length >= 4 && d.length >= 4 && (d.includes(compact) || compact.includes(d))) return true;
  }
  return false;
}

export function computeVerification(i: VerificationInput): { status: VerificationStatus; notes: string[] } {
  const notes: string[] = [];
  const consistent = i.websiteFetched && nameConsistent(i.name, i.siteTitles, i.domain);
  if (i.websiteFetched) notes.push(consistent ? "WEBSITE_NAME_MATCH" : "WEBSITE_NAME_MISMATCH");
  else if (i.domain) notes.push("WEBSITE_NOT_FETCHED");
  else notes.push("NO_WEBSITE");
  if (i.socialsFromWebsite > 0) notes.push("SOCIALS_LINKED_FROM_WEBSITE");
  if (i.hasOsmRecord) notes.push("OSM_RECORD");
  if (i.independentSources >= 2) notes.push("MULTIPLE_SOURCES");
  if (i.socialsFromSearchOnly > 0 && i.socialsFromWebsite === 0) notes.push("SOCIALS_FROM_SEARCH_ONLY");

  if (consistent && (i.socialsFromWebsite > 0 || i.hasOsmRecord)) return { status: "VERIFIED", notes };
  if (consistent) return { status: "LIKELY", notes };
  if (i.hasOsmRecord && (i.domain || i.socialsFromSearchOnly > 0)) return { status: "LIKELY", notes };
  if (i.independentSources >= 2) return { status: "LIKELY", notes };
  return { status: "UNVERIFIED", notes };
}
