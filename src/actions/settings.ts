"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { getDomain, normalizeName } from "@/lib/discovery/normalize";
import { parseSocialUrl } from "@/lib/discovery/social";

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(/[,،\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 20);

const profile = z.object({ agencyName: z.string().trim().max(120), agencyDescription: z.string().trim().max(400), agencyWebsite: z.string().trim().max(200), agencyPortfolio: z.string().trim().max(200), agencyContact: z.string().trim().max(200), writingStyle: z.string().trim().max(500) });

export async function saveAgencyProfileAction(formData: FormData) {
  const u = await requireRole("ADMIN");
  const r = profile.safeParse(Object.fromEntries(formData));
  if (!r.success) redirect("/settings?error=INVALID_INPUT");
  await db.organization.update({ where: { id: u.organizationId }, data: { ...r.data, agencyServices: list(formData.get("agencyServices")) } });
  await audit(u, "SETTINGS_AGENCY");
  redirect("/settings?ok=SAVED");
}

export async function saveWeightsAction(formData: FormData) {
  const u = await requireRole("ADMIN");
  const n = (k: string) => Math.max(0, Math.min(100, Number(formData.get(k) ?? 0) || 0));
  const w = { businessFit: n("businessFit"), opportunity: n("opportunity"), contact: n("contact"), marketing: n("marketing"), freshness: n("freshness") };
  if (Object.values(w).reduce((a, b) => a + b, 0) <= 0) redirect("/settings?error=INVALID_INPUT#scoring");
  await db.organization.update({ where: { id: u.organizationId }, data: { scoringWeights: w } });
  await audit(u, "SETTINGS_WEIGHTS", "", "", w);
  redirect("/settings?ok=SAVED#scoring");
}

export async function saveTemplateAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80), content = String(formData.get("content") ?? "").trim().slice(0, 3000);
  if (!name || !content) redirect("/settings?error=INVALID_INPUT#templates");
  await db.messageTemplate.create({ data: { organizationId: u.organizationId, name, content, language: /[؀-ۿ]/.test(content) ? "ar" : "en" } });
  await audit(u, "TEMPLATE_CREATE");
  redirect("/settings?ok=SAVED#templates");
}

export async function deleteTemplateAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  await db.messageTemplate.deleteMany({ where: { id: String(formData.get("id")), organizationId: u.organizationId } });
  await audit(u, "TEMPLATE_DELETE");
  redirect("/settings?ok=DELETED#templates");
}

export async function addDncAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const value = String(formData.get("value") ?? "").trim();
  if (value.length < 2) redirect("/settings?error=INVALID_INPUT#dnc");
  const social = parseSocialUrl(value);
  const domain = social ? null : (/[.\/]/.test(value) ? getDomain(value) : null);
  await db.doNotContact.create({ data: { organizationId: u.organizationId, name: social || domain ? "" : normalizeName(value), domain, handle: social?.handle ?? null, reason: String(formData.get("reason") ?? "").slice(0, 200) } });
  // Existing matching leads are flagged immediately.
  await db.lead.updateMany({
    where: { organizationId: u.organizationId, OR: [...(domain ? [{ domain }] : []), ...(social ? [{ socials: { some: { platform: social.platform, handle: social.handle } } }] : []), ...(!social && !domain ? [{ normalizedName: normalizeName(value) }] : [])] },
    data: { status: "DO_NOT_CONTACT" },
  });
  await audit(u, "DNC_ADD", "", "", { domain, handle: social?.handle ?? null });
  redirect("/settings?ok=SAVED#dnc");
}

export async function removeDncAction(formData: FormData) {
  const u = await requireRole("ADMIN");
  await db.doNotContact.deleteMany({ where: { id: String(formData.get("id")), organizationId: u.organizationId } });
  await audit(u, "DNC_REMOVE");
  redirect("/settings?ok=DELETED#dnc");
}
