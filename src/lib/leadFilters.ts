import type { Prisma, User } from "@prisma/client";
import { leadScope } from "./auth";
import { LEAD_STATUSES } from "./outreach";

export interface LeadFilterParams { q?: string; country?: string; city?: string; industry?: string; minScore?: string; maxScore?: string; platform?: string; campaign?: string; status?: string; verification?: string; from?: string; to?: string; assigned?: string; sort?: string; page?: string }

/** One filter builder shared by the lead list, the reports and the CSV export, so they always agree. */
export function leadWhere(u: Pick<User, "id" | "role" | "organizationId">, f: LeadFilterParams): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [leadScope(u)];
  const q = f.q?.trim();
  if (q) and.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { domain: { contains: q.toLowerCase() } }, { city: { contains: q, mode: "insensitive" } }, { socials: { some: { handle: { contains: q.toLowerCase().replace(/^@/, "") } } } }] });
  if (f.country) and.push({ country: f.country });
  if (f.city) and.push({ city: { contains: f.city, mode: "insensitive" } });
  if (f.industry) and.push({ industry: f.industry });
  const min = Number(f.minScore), max = Number(f.maxScore);
  if (f.minScore && Number.isFinite(min)) and.push({ score: { gte: min } });
  if (f.maxScore && Number.isFinite(max)) and.push({ score: { lte: max } });
  if (f.platform === "whatsapp") and.push({ whatsapp: { not: null } });
  else if (f.platform === "website") and.push({ website: { not: null } });
  else if (f.platform) and.push({ socials: { some: { platform: f.platform } } });
  if (f.campaign) and.push({ campaignId: f.campaign });
  if (f.status && (LEAD_STATUSES as readonly string[]).includes(f.status)) and.push({ status: f.status as any });
  if (f.verification && ["VERIFIED", "LIKELY", "UNVERIFIED"].includes(f.verification)) and.push({ verification: f.verification as any });
  const from = f.from ? new Date(f.from) : null, to = f.to ? new Date(`${f.to}T23:59:59`) : null;
  if (from && !isNaN(from.getTime())) and.push({ discoveredAt: { gte: from } });
  if (to && !isNaN(to.getTime())) and.push({ discoveredAt: { lte: to } });
  if (f.assigned === "none") and.push({ assignedToId: null });
  else if (f.assigned) and.push({ assignedToId: f.assigned });
  return { AND: and };
}

export function leadOrder(sort?: string): Prisma.LeadOrderByWithRelationInput[] {
  switch (sort) {
    case "new": return [{ discoveredAt: "desc" }];
    case "old": return [{ discoveredAt: "asc" }];
    case "score_asc": return [{ score: "asc" }, { discoveredAt: "desc" }];
    case "name": return [{ name: "asc" }];
    case "checked": return [{ lastCheckedAt: "desc" }];
    default: return [{ score: "desc" }, { discoveredAt: "desc" }];
  }
}

export function filterQuery(f: Record<string, string | undefined>, override: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...override })) if (v !== undefined && v !== "" && k !== "ok" && k !== "error" && k !== "created" && k !== "merged" && k !== "skipped") p.set(k, String(v));
  return p.toString();
}
