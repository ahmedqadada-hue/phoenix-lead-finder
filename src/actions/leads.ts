"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { safeBack } from "@/lib/safeBack";
import { audit, leadScope, requireRole, requireUser } from "@/lib/auth";
import { ingestCandidate, rescoreLead } from "@/lib/discovery/engine";
import { getDomain, normalizeName, normalizePhone } from "@/lib/discovery/normalize";
import { parseSocialUrl } from "@/lib/discovery/social";
import { assertSafeUrl } from "@/lib/ssrf";
import { enqueue } from "@/lib/jobs";
import { parseCsv } from "@/lib/csv";
import { isValidStatus } from "@/lib/outreach";
import { usableAI } from "@/lib/providers/connections";
import type { Candidate } from "@/lib/discovery/candidates";
import type { User } from "@prisma/client";

async function ownLead(u: User, id: string) {
  const lead = await db.lead.findFirst({ where: { id, ...leadScope(u) } });
  if (!lead) redirect("/leads?error=FORBIDDEN");
  return lead;
}

function cleanWebsite(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try { return assertSafeUrl(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin; } catch { return null; }
}

function manualCandidate(d: { name: string; city: string; country: string; industry: string; website: string; whatsapp: string; phone: string; socials: string[] }, provider: "manual" | "csv", by: string): Candidate {
  const website = cleanWebsite(d.website);
  const socials: Candidate["socials"] = [];
  for (const s of d.socials) { const r = parseSocialUrl(s); if (r && r.platform !== "whatsapp" && !socials.some((x) => x.platform === r.platform && x.handle === r.handle)) socials.push({ ...r, sourceUrl: `${provider}:${by}`, verified: false }); }
  const whatsapp = normalizePhone(d.whatsapp, d.country);
  return {
    name: d.name.trim().slice(0, 150), city: d.city.trim(), country: d.country.trim(), industry: d.industry.trim(), category: "",
    website, domain: getDomain(website), phone: normalizePhone(d.phone, d.country), whatsapp, whatsappSource: whatsapp ? `${provider}:${by}` : null,
    description: "", socials, fromOsm: false,
    source: { provider, url: website ?? "", title: d.name.trim().slice(0, 150), snippet: provider === "csv" ? "Imported from a CSV file" : "Entered manually", query: "", publishedAt: null },
  };
}

const manualSchema = z.object({ name: z.string().trim().min(2).max(150), city: z.string().max(80).default(""), country: z.string().max(80).default(""), industry: z.string().max(80).default(""), website: z.string().max(300).default(""), whatsapp: z.string().max(40).default(""), phone: z.string().max(40).default(""), instagram: z.string().max(300).default("") });

export async function addLeadAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const r = manualSchema.safeParse(Object.fromEntries(formData));
  if (!r.success) redirect("/leads?error=INVALID_INPUT");
  const d = r.data;
  const ig = d.instagram.trim() && !/^https?:/i.test(d.instagram.trim()) ? `https://www.instagram.com/${d.instagram.trim().replace(/^@/, "")}` : d.instagram.trim();
  const res = await ingestCandidate(u.organizationId, manualCandidate({ ...d, socials: ig ? [ig] : [] }, "manual", u.name), null);
  await audit(u, "LEAD_ADD_MANUAL", "Lead", res.leadId ?? "", { outcome: res.outcome });
  if (res.outcome === "DO_NOT_CONTACT") redirect("/leads?error=DNC_BLOCKED");
  redirect(`/leads/${res.leadId}?ok=${res.outcome === "MERGED" ? "DUPLICATE_LEAD" : "SAVED"}`);
}

const COLS: Record<string, string[]> = {
  name: ["name", "company", "business", "الاسم", "اسم الشركة", "الشركة", "النشاط"], city: ["city", "المدينة"], country: ["country", "الدولة"],
  industry: ["industry", "المجال", "القطاع"], website: ["website", "url", "site", "الموقع"], whatsapp: ["whatsapp", "واتساب"], phone: ["phone", "tel", "الهاتف", "الجوال"],
  instagram: ["instagram", "انستغرام", "إنستغرام"], facebook: ["facebook", "فيسبوك"], linkedin: ["linkedin", "لينكدإن"], tiktok: ["tiktok", "تيك توك"],
};

/** CSV import. The first row must be a header; only the "name" column is required. */
export async function importCsvAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 3_000_000) redirect("/leads?error=CSV_EMPTY");
  const rows = parseCsv(await file.text());
  if (rows.length < 2) redirect("/leads?error=CSV_EMPTY");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.findIndex((h) => COLS[k].includes(h));
  const nameI = idx("name");
  if (nameI < 0) redirect("/leads?error=CSV_EMPTY");
  const get = (row: string[], k: string) => { const i = idx(k); return i >= 0 ? (row[i] ?? "").trim() : ""; };
  const fix = (v: string, base: string) => (v && !/^https?:/i.test(v) ? `${base}${v.replace(/^@/, "")}` : v);
  let created = 0, merged = 0, skipped = 0;
  for (const row of rows.slice(1, 1001)) {
    const name = (row[nameI] ?? "").trim();
    if (name.length < 2) { skipped++; continue; }
    const cand = manualCandidate({
      name, city: get(row, "city") || String(formData.get("city") ?? ""), country: get(row, "country") || String(formData.get("country") ?? ""), industry: get(row, "industry") || String(formData.get("industry") ?? ""),
      website: get(row, "website"), whatsapp: get(row, "whatsapp"), phone: get(row, "phone"),
      socials: [fix(get(row, "instagram"), "https://www.instagram.com/"), fix(get(row, "facebook"), "https://www.facebook.com/"), fix(get(row, "linkedin"), "https://www.linkedin.com/company/"), fix(get(row, "tiktok"), "https://www.tiktok.com/@")].filter(Boolean),
    }, "csv", file.name.slice(0, 60));
    const res = await ingestCandidate(u.organizationId, cand, null);
    if (res.outcome === "CREATED") created++; else if (res.outcome === "MERGED") merged++; else skipped++;
  }
  await audit(u, "LEAD_IMPORT_CSV", "Lead", "", { created, merged, skipped, file: file.name.slice(0, 60) });
  redirect(`/leads?ok=IMPORTED&created=${created}&merged=${merged}&skipped=${skipped}`);
}

const editSchema = z.object({
  name: z.string().trim().min(2).max(150), industry: z.string().trim().max(80), country: z.string().trim().max(80), city: z.string().trim().max(80),
  website: z.string().trim().max(300), whatsapp: z.string().trim().max(40), phone: z.string().trim().max(40), notes: z.string().max(5000), description: z.string().max(1000),
});

export async function updateLeadAction(formData: FormData) {
  const u = await requireUser();
  const lead = await ownLead(u, String(formData.get("id")));
  const r = editSchema.safeParse(Object.fromEntries(formData));
  if (!r.success) redirect(`/leads/${lead.id}?error=INVALID_INPUT`);
  const d = r.data;
  const website = d.website ? cleanWebsite(d.website) : null;
  if (d.website && !website) redirect(`/leads/${lead.id}?error=INVALID_URL`);
  const whatsapp = d.whatsapp ? normalizePhone(d.whatsapp, d.country) : null;
  if (d.whatsapp && !whatsapp) redirect(`/leads/${lead.id}?error=INVALID_WHATSAPP`);
  await db.lead.update({
    where: { id: lead.id },
    data: {
      name: d.name, normalizedName: normalizeName(d.name), industry: d.industry, country: d.country, city: d.city, description: d.description, notes: d.notes,
      website, domain: getDomain(website), phone: d.phone ? normalizePhone(d.phone, d.country) ?? lead.phone : null,
      whatsapp, whatsappSource: whatsapp ? (whatsapp === lead.whatsapp ? lead.whatsappSource : `manual:${u.name}`) : null,
    },
  });
  await rescoreLead(lead.id);
  await audit(u, "LEAD_UPDATE", "Lead", lead.id);
  redirect(`/leads/${lead.id}?ok=SAVED`);
}

export async function addSocialAction(formData: FormData) {
  const u = await requireUser();
  const lead = await ownLead(u, String(formData.get("id")));
  const ref = parseSocialUrl(String(formData.get("url") ?? ""));
  if (!ref || ref.platform === "whatsapp") redirect(`/leads/${lead.id}?error=INVALID_URL`);
  await db.leadSocialAccount.upsert({
    where: { leadId_platform_handle: { leadId: lead.id, platform: ref.platform, handle: ref.handle } },
    update: {}, create: { leadId: lead.id, platform: ref.platform, handle: ref.handle, url: ref.url, sourceUrl: `manual:${u.name}`, verified: false },
  });
  await rescoreLead(lead.id);
  await audit(u, "LEAD_SOCIAL_ADD", "Lead", lead.id, { platform: ref.platform });
  redirect(`/leads/${lead.id}?ok=SAVED`);
}

export async function removeSocialAction(formData: FormData) {
  const u = await requireUser();
  const lead = await ownLead(u, String(formData.get("id")));
  await db.leadSocialAccount.deleteMany({ where: { id: String(formData.get("socialId")), leadId: lead.id } });
  await rescoreLead(lead.id);
  await audit(u, "LEAD_SOCIAL_REMOVE", "Lead", lead.id);
  redirect(`/leads/${lead.id}?ok=DELETED`);
}

/** Manual status change. Setting DO_NOT_CONTACT also adds the business to the registry
 *  so future discovery never brings it back. */
export async function setStatusAction(formData: FormData) {
  const u = await requireUser();
  const lead = await ownLead(u, String(formData.get("id")));
  const status = String(formData.get("status") ?? "");
  const back = safeBack(formData.get("back"), `/leads/${lead.id}`);
  if (!isValidStatus(status)) redirect(`${back}?error=INVALID_INPUT`);
  await db.lead.update({ where: { id: lead.id }, data: { status } });
  await db.outreachActivity.create({ data: { leadId: lead.id, userId: u.id, type: status === "SENT_MANUALLY" ? "MARKED_SENT" : "STATUS_CHANGE", platform: String(formData.get("platform") ?? ""), detail: `${lead.status} → ${status}` } });
  if (status === "DO_NOT_CONTACT") {
    const socials = await db.leadSocialAccount.findMany({ where: { leadId: lead.id } });
    const exists = await db.doNotContact.findFirst({ where: { organizationId: u.organizationId, OR: [...(lead.domain ? [{ domain: lead.domain }] : []), { name: lead.normalizedName }] } });
    if (!exists) {
      await db.doNotContact.create({ data: { organizationId: u.organizationId, name: lead.normalizedName, domain: lead.domain, handle: null, reason: `Marked by ${u.name}` } });
      for (const s of socials) await db.doNotContact.create({ data: { organizationId: u.organizationId, name: lead.normalizedName, handle: s.handle, reason: `Marked by ${u.name}` } });
    }
  }
  await audit(u, "LEAD_STATUS", "Lead", lead.id, { from: lead.status, to: status });
  redirect(`${back}${back.includes("?") ? "&" : "?"}ok=SAVED`);
}

export async function assignLeadAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const lead = await ownLead(u, String(formData.get("id")));
  const to = String(formData.get("assignedToId") ?? "");
  const target = to ? await db.user.findFirst({ where: { id: to, organizationId: u.organizationId, active: true } }) : null;
  await db.lead.update({ where: { id: lead.id }, data: { assignedToId: target?.id ?? null } });
  await audit(u, "LEAD_ASSIGN", "Lead", lead.id, { to: target?.id ?? null });
  redirect(`/leads/${lead.id}?ok=SAVED`);
}

export async function bulkAssignAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const ids = formData.getAll("ids").map(String).slice(0, 200);
  const to = String(formData.get("assignedToId") ?? "");
  const target = to ? await db.user.findFirst({ where: { id: to, organizationId: u.organizationId, active: true } }) : null;
  if (ids.length) await db.lead.updateMany({ where: { id: { in: ids }, organizationId: u.organizationId }, data: { assignedToId: target?.id ?? null } });
  await audit(u, "LEAD_BULK_ASSIGN", "Lead", "", { count: ids.length, to: target?.id ?? null });
  redirect(safeBack(formData.get("back"), "/leads"));
}

export async function recheckLeadAction(formData: FormData) {
  const u = await requireUser();
  const lead = await ownLead(u, String(formData.get("id")));
  await enqueue({ organizationId: u.organizationId, type: "ENRICH", payload: { leadId: lead.id }, dedupeKey: `e:${lead.id}:${Date.now()}` });
  await audit(u, "LEAD_RECHECK", "Lead", lead.id);
  redirect(`/leads/${lead.id}?ok=QUEUED`);
}

export async function analyzeLeadAction(formData: FormData) {
  const u = await requireUser();
  const lead = await ownLead(u, String(formData.get("id")));
  const back = safeBack(formData.get("back"), `/leads/${lead.id}`);
  if (!(await usableAI(u.organizationId))) redirect(`${back}?error=AI_NOT_CONFIGURED`);
  // Re-reading the website first gives the AI fresh, sourced material.
  await enqueue({ organizationId: u.organizationId, type: "ENRICH", payload: { leadId: lead.id }, dedupeKey: `e:${lead.id}:${Date.now()}` });
  await audit(u, "LEAD_ANALYZE", "Lead", lead.id);
  redirect(`${back}?ok=QUEUED`);
}

export async function deleteLeadAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const lead = await ownLead(u, String(formData.get("id")));
  await db.lead.delete({ where: { id: lead.id } });
  await audit(u, "LEAD_DELETE", "Lead", lead.id, { name: lead.name });
  redirect("/leads?ok=DELETED");
}

