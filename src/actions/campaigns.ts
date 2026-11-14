"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { safeBack } from "@/lib/safeBack";
import { audit, requireRole } from "@/lib/auth";
import { startCampaignRun, finalizeCampaignIfDone } from "@/lib/discovery/engine";

const list = (v: FormDataEntryValue | null) => String(v ?? "").split(/[,،\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 20);

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(80),
  industry: z.string().trim().min(2).max(80),
  category: z.string().trim().max(80).default(""),
  language: z.enum(["ar", "en", "both"]).default("ar"),
  targetCount: z.coerce.number().int().min(1).max(500),
  minScore: z.coerce.number().int().min(0).max(100),
  schedule: z.enum(["MANUAL", "DAILY", "WEEKLY"]).default("MANUAL"),
});

function parse(formData: FormData) {
  const industry = String(formData.get("industry") ?? "") === "__other" ? String(formData.get("industryOther") ?? "") : String(formData.get("industry") ?? "");
  const r = schema.safeParse({ ...Object.fromEntries(formData), industry });
  if (!r.success) return null;
  return { ...r.data, cities: list(formData.get("cities")), services: list(formData.get("services")) };
}

export async function createCampaignAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const d = parse(formData);
  const back = safeBack(formData.get("back"), "/campaigns");
  if (!d) redirect(`${back}?error=INVALID_INPUT`);
  const c = await db.campaign.create({ data: { ...d, organizationId: u.organizationId, createdById: u.id } });
  await audit(u, "CAMPAIGN_CREATE", "Campaign", c.id);
  if (formData.get("start") === "1") {
    const r = await startCampaignRun(c.id);
    await audit(u, "CAMPAIGN_START", "Campaign", c.id, { jobs: r.jobs });
    redirect(`/campaigns/${c.id}?${r.jobs ? "ok=STARTED" : "error=NO_PROVIDER_AVAILABLE"}`);
  }
  redirect(`/campaigns/${c.id}?ok=SAVED`);
}

async function own(id: string, organizationId: string) {
  const c = await db.campaign.findFirst({ where: { id, organizationId } });
  if (!c) redirect("/campaigns?error=FORBIDDEN");
  return c;
}

export async function updateCampaignAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const c = await own(String(formData.get("id")), u.organizationId);
  const d = parse(formData);
  if (!d) redirect(`/campaigns/${c.id}?error=INVALID_INPUT`);
  await db.campaign.update({ where: { id: c.id }, data: d });
  await audit(u, "CAMPAIGN_UPDATE", "Campaign", c.id);
  redirect(`/campaigns/${c.id}?ok=SAVED`);
}

export async function startCampaignAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const c = await own(String(formData.get("id")), u.organizationId);
  if (c.status === "RUNNING") redirect(`/campaigns/${c.id}`);
  const r = await startCampaignRun(c.id);
  await audit(u, "CAMPAIGN_START", "Campaign", c.id, { jobs: r.jobs });
  redirect(`/campaigns/${c.id}?${r.jobs ? "ok=STARTED" : "error=NO_PROVIDER_AVAILABLE"}`);
}

export async function pauseCampaignAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const c = await own(String(formData.get("id")), u.organizationId);
  if (c.status === "RUNNING") await db.campaign.update({ where: { id: c.id }, data: { status: "PAUSED" } });
  await audit(u, "CAMPAIGN_PAUSE", "Campaign", c.id);
  redirect(`/campaigns/${c.id}?ok=PAUSED`);
}

export async function resumeCampaignAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const c = await own(String(formData.get("id")), u.organizationId);
  if (c.status === "PAUSED") { await db.campaign.update({ where: { id: c.id }, data: { status: "RUNNING" } }); await finalizeCampaignIfDone(c.id); }
  await audit(u, "CAMPAIGN_RESUME", "Campaign", c.id);
  redirect(`/campaigns/${c.id}?ok=RESUMED`);
}

export async function duplicateCampaignAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const c = await own(String(formData.get("id")), u.organizationId);
  const copy = await db.campaign.create({
    data: { organizationId: u.organizationId, createdById: u.id, name: `${c.name} (2)`.slice(0, 120), country: c.country, cities: c.cities, industry: c.industry, category: c.category, services: c.services, language: c.language, targetCount: c.targetCount, minScore: c.minScore, schedule: "MANUAL" },
  });
  await audit(u, "CAMPAIGN_DUPLICATE", "Campaign", copy.id, { from: c.id });
  redirect(`/campaigns/${copy.id}?ok=DUPLICATED`);
}

/** Deletes the campaign and its queued jobs. Leads already saved are kept in the database. */
export async function deleteCampaignAction(formData: FormData) {
  const u = await requireRole("ADMIN", "MANAGER");
  const c = await own(String(formData.get("id")), u.organizationId);
  await db.campaign.delete({ where: { id: c.id } });
  await audit(u, "CAMPAIGN_DELETE", "Campaign", c.id, { name: c.name });
  revalidatePath("/campaigns");
  redirect("/campaigns?ok=DELETED");
}
