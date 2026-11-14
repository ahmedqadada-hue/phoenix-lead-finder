// Explainable 100-point lead score. These are business-fit scores, NOT
// probabilities of closing a sale.

export interface ScoringWeights {
  businessFit: number;
  opportunity: number;
  contact: number;
  marketing: number;
  freshness: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = { businessFit: 30, opportunity: 30, contact: 20, marketing: 15, freshness: 5 };

export interface ScoreInput {
  industryMatchesCampaign: boolean;
  hasDescription: boolean;
  aiFit?: number | null;            // 0..1 from AI analysis, when available
  signals: { confidence: "LOW" | "MEDIUM" | "HIGH"; uncertain: boolean }[];
  verification: "VERIFIED" | "LIKELY" | "UNVERIFIED";
  hasWebsite: boolean;
  hasWhatsapp: boolean;
  hasPhone: boolean;
  socials: { platform: string; verified: boolean }[];
  lastCheckedAt: Date;
  now?: Date;
}

export interface ScoreFactor {
  key: keyof ScoringWeights;
  score: number;
  max: number;
  reasons: string[]; // reason codes, translated in the UI
}

export interface ScoreResult {
  total: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  factors: ScoreFactor[];
}

export function priorityOf(total: number): "HIGH" | "MEDIUM" | "LOW" {
  return total >= 80 ? "HIGH" : total >= 60 ? "MEDIUM" : "LOW";
}

export function normalizeWeights(w?: Partial<ScoringWeights> | null): ScoringWeights {
  const merged = { ...DEFAULT_WEIGHTS, ...(w ?? {}) };
  const vals = Object.values(merged).map((v) => (Number.isFinite(v) && v >= 0 ? Number(v) : 0));
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) return DEFAULT_WEIGHTS;
  const keys = Object.keys(merged) as (keyof ScoringWeights)[];
  const out = {} as ScoringWeights;
  keys.forEach((k, i) => (out[k] = (vals[i] / sum) * 100));
  return out;
}

export function scoreLead(input: ScoreInput, weights?: Partial<ScoringWeights> | null): ScoreResult {
  const w = normalizeWeights(weights);
  const now = input.now ?? new Date();
  const factors: ScoreFactor[] = [];

  // 1) Business fit
  let fit = 0; const fitR: string[] = [];
  if (typeof input.aiFit === "number") { fit = Math.max(0, Math.min(1, input.aiFit)); fitR.push("FIT_AI_ASSESSED"); }
  else {
    if (input.industryMatchesCampaign) { fit += 0.6; fitR.push("FIT_INDUSTRY_MATCH"); } else fitR.push("FIT_INDUSTRY_UNKNOWN");
    if (input.hasDescription) { fit += 0.1; fitR.push("FIT_HAS_DESCRIPTION"); }
    if (input.verification === "VERIFIED") { fit += 0.2; fitR.push("FIT_VERIFIED_BUSINESS"); }
    else if (input.verification === "LIKELY") { fit += 0.1; fitR.push("FIT_LIKELY_BUSINESS"); }
    fitR.push("FIT_RULES_ONLY");
  }
  factors.push({ key: "businessFit", score: fit * w.businessFit, max: w.businessFit, reasons: fitR });

  // 2) Opportunity strength
  let opp = 0; const oppR: string[] = [];
  const rank = { LOW: 0.35, MEDIUM: 0.7, HIGH: 1 } as const;
  for (const s of input.signals) opp = Math.max(opp, rank[s.confidence] * (s.uncertain ? 0.5 : 1));
  if (!input.signals.length) oppR.push("OPP_NO_EVIDENCE");
  else { oppR.push(`OPP_SIGNALS_${input.signals.length > 1 ? "MANY" : "ONE"}`); if (input.signals.length > 1) opp = Math.min(1, opp + 0.1); }
  factors.push({ key: "opportunity", score: opp * w.opportunity, max: w.opportunity, reasons: oppR });

  // 3) Verified contact availability
  let contact = 0; const cR: string[] = [];
  const verifiedSocials = input.socials.filter((s) => s.verified && s.platform !== "whatsapp").length;
  const unverifiedSocials = input.socials.filter((s) => !s.verified && s.platform !== "whatsapp").length;
  if (input.hasWhatsapp) { contact += 0.4; cR.push("CONTACT_WHATSAPP"); }
  if (verifiedSocials) { contact += Math.min(0.4, verifiedSocials * 0.2); cR.push("CONTACT_VERIFIED_SOCIAL"); }
  else if (unverifiedSocials) { contact += 0.15; cR.push("CONTACT_UNVERIFIED_SOCIAL"); }
  if (input.hasWebsite) { contact += 0.1; cR.push("CONTACT_WEBSITE"); }
  if (input.hasPhone) { contact += 0.1; cR.push("CONTACT_PHONE"); }
  if (!cR.length) cR.push("CONTACT_NONE");
  contact = Math.min(1, contact);
  factors.push({ key: "contact", score: contact * w.contact, max: w.contact, reasons: cR });

  // 4) Marketing activity (public presence breadth; a proxy, stated as such)
  const platforms = new Set(input.socials.filter((s) => s.platform !== "whatsapp").map((s) => s.platform)).size;
  const mk = platforms >= 3 ? 1 : platforms === 2 ? 0.7 : platforms === 1 ? 0.4 : 0;
  factors.push({ key: "marketing", score: mk * w.marketing, max: w.marketing, reasons: [`MARKETING_PLATFORMS_${Math.min(platforms, 3)}`] });

  // 5) Freshness
  const days = (now.getTime() - input.lastCheckedAt.getTime()) / 86400000;
  const fr = days <= 7 ? 1 : days <= 30 ? 0.6 : days <= 90 ? 0.3 : 0;
  factors.push({ key: "freshness", score: fr * w.freshness, max: w.freshness, reasons: [days <= 7 ? "FRESH_WEEK" : days <= 30 ? "FRESH_MONTH" : days <= 90 ? "FRESH_QUARTER" : "FRESH_STALE"] });

  for (const f of factors) { f.score = Math.round(f.score * 10) / 10; f.max = Math.round(f.max * 10) / 10; }
  const total = Math.max(0, Math.min(100, Math.round(factors.reduce((a, f) => a + f.score, 0))));
  return { total, priority: priorityOf(total), factors };
}
