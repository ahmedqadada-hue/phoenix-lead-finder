// End-to-end workflow against a REAL PostgreSQL test database.
// External services are replaced by clearly labelled FIXTURES (".example" domains,
// names starting with "FIXTURE"). Nothing here is ever shown as production data.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state: { user: any } = { user: null };
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Map() }));
vi.mock("@/lib/auth", async (orig) => {
  const real = await orig<typeof import("@/lib/auth")>();
  return { ...real, requireUser: async () => state.user, getCurrentUser: async () => state.user, requireRole: async (...roles: string[]) => { if (!roles.includes(state.user.role)) throw new Error("REDIRECT:/?error=FORBIDDEN"); return state.user; } };
});
const fetchSite = vi.fn();
vi.mock("@/lib/discovery/website", async (orig) => ({ ...(await orig<typeof import("@/lib/discovery/website")>()), fetchSite: (...a: unknown[]) => fetchSite(...a) }));

import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import { leadScope } from "@/lib/auth";
import { claimNext, enqueue, recoverStaleJobs } from "@/lib/jobs";
import { drainJobs, ingestCandidate, runJob, runScheduler, startCampaignRun, workFor } from "@/lib/discovery/engine";
import { tavily } from "@/lib/providers/search/web";
import { osm } from "@/lib/providers/search/osm";
import { AI_PROVIDERS } from "@/lib/providers/ai/registry";
import { ProviderError } from "@/lib/providers/search/types";
import { consumeQuota, ensureDefaultConnections } from "@/lib/providers/connections";
import { hitToCandidate } from "@/lib/discovery/candidates";
import { leadWhere } from "@/lib/leadFilters";
import { buildWhatsAppLink } from "@/lib/outreach";
import { generateMessageAction, saveMessageAction } from "@/actions/messages";
import { markSentAction, recordContactOpenedAction } from "@/actions/outreach";
import { setStatusAction } from "@/actions/leads";
import { createCampaignAction, pauseCampaignAction } from "@/actions/campaigns";
import { saveProviderAction } from "@/actions/providers";

const SITE = "https://fixture-grill.example";
const FIXTURE_HITS = [
  { title: "FIXTURE Grill - الرئيسية", url: `${SITE}/`, snippet: "مطعم مشويات في الرياض" },
  { title: "FIXTURE Grill (@fixturegrill) • Instagram photos and videos", url: "https://www.instagram.com/fixturegrill/", snippet: "قريباً افتتاح فرعنا الجديد في حي الملقا" },
  { title: "FIXTURE Sweets (@fixture.sweets) • Instagram photos and videos", url: "https://www.instagram.com/fixture.sweets/", snippet: "حلويات في الرياض" },
  { title: "مطاعم الرياض - ويكيبيديا", url: "https://ar.wikipedia.org/wiki/fixture", snippet: "مقال" },
];
const FIXTURE_SITE = {
  ok: true, finalUrl: `${SITE}/`, titles: ["FIXTURE Grill | مشويات"], siteName: "FIXTURE Grill", description: "مطعم مشويات", logoUrl: null,
  socials: [
    { platform: "instagram", handle: "fixturegrill", url: "https://www.instagram.com/fixturegrill/", sourceUrl: `${SITE}/` },
    { platform: "whatsapp", handle: "966501234567", url: "https://wa.me/966501234567", sourceUrl: `${SITE}/` },
  ],
  phones: ["966112345678"], textSample: "نسعد بالإعلان عن افتتاح فرعنا الجديد في حي الملقا الأسبوع القادم. قائمة الطعام.",
};
const FIXTURE_AI = JSON.stringify({
  summary: "مطعم مشويات في الرياض.", business_fit: 0.9, fit_reason: "مطعم يتوسع", suggested_services: ["إنتاج فيديو"], insufficient_evidence: false,
  opportunities: [
    { title: "افتتاح فرع جديد", explanation: "أعلن المطعم عن فرع جديد", evidence: "افتتاح فرعنا الجديد في حي الملقا", source_url: `${SITE}/`, published_date: null, suggested_service: "فيديوهات قصيرة", confidence: "HIGH" },
    { title: "جولة تمويل", explanation: "مختلقة", evidence: "حصل على تمويل", source_url: "https://invented.example/news", confidence: "HIGH" },
  ],
});

let orgId = "", adminId = "", employeeId = "", campaignId = "";
const search = vi.spyOn(tavily, "search");
const osmSearch = vi.spyOn(osm, "search");
const chat = vi.spyOn(AI_PROVIDERS[0], "chat");

async function reset() {
  await db.$executeRawUnsafe('TRUNCATE "Organization" CASCADE');
  const org = await db.organization.create({ data: { name: "FIXTURE Agency", agencyName: "وكالة الاختبار", agencyServices: ["إنتاج فيديو"], agencyContact: "+966500000001" } });
  orgId = org.id;
  const pw = await hashPassword("test-password-1");
  const admin = await db.user.create({ data: { organizationId: orgId, email: "admin@fixture.example", name: "Admin", passwordHash: pw, role: "ADMIN" } });
  const emp = await db.user.create({ data: { organizationId: orgId, email: "emp@fixture.example", name: "Employee", passwordHash: pw, role: "EMPLOYEE" } });
  adminId = admin.id; employeeId = emp.id; state.user = admin;
  await db.providerConnection.create({ data: { organizationId: orgId, kind: "SEARCH", provider: "tavily", encryptedKey: encryptSecret("tvly-fixture"), monthlyLimit: 100, enabled: true } });
  await db.providerConnection.create({ data: { organizationId: orgId, kind: "AI", provider: "openai", encryptedKey: encryptSecret("sk-fixture"), monthlyLimit: 100, enabled: true, model: "fixture-model" } });
  const c = await db.campaign.create({ data: { organizationId: orgId, name: "FIXTURE campaign", country: "Saudi Arabia", cities: ["الرياض"], industry: "restaurants", services: ["إنتاج فيديو"], language: "ar", targetCount: 20, minScore: 40 } });
  campaignId = c.id;
}

beforeAll(async () => { await reset(); });
beforeEach(() => {
  search.mockReset(); osmSearch.mockReset(); chat.mockReset(); fetchSite.mockReset();
  search.mockImplementation(async (req) => (req.query.includes("site:instagram.com") && !req.query.includes("افتتاح") ? FIXTURE_HITS : []));
  fetchSite.mockImplementation(async (url: string) => (url.startsWith(SITE) ? FIXTURE_SITE : { ok: false, finalUrl: url, titles: [], siteName: "", description: "", logoUrl: null, socials: [], phones: [], textSample: "", error: "HTTP_404" }));
  chat.mockResolvedValue({ text: FIXTURE_AI, inputTokens: 100, outputTokens: 50 });
});
afterAll(async () => { await db.$disconnect(); });

describe("full discovery → outreach workflow", () => {
  it("runs a campaign: search, dedupe, verify identity, find official profiles, analyse, score", async () => {
    const started = await startCampaignRun(campaignId);
    expect(started.jobs).toBeGreaterThan(3);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("RUNNING");
    await drainJobs();

    const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(c.status).toBe("COMPLETED");
    expect(c.queriesDone).toBe(c.queriesTotal);
    expect(search).toHaveBeenCalled();
    expect(search.mock.calls[0][1]).toBe("tvly-fixture"); // key decrypted server-side only

    const leads = await db.lead.findMany({ where: { organizationId: orgId }, include: { socials: true, sources: true, signals: true, analyses: true, scores: true }, orderBy: { score: "desc" } });
    // website hit + Instagram hit of the same business were merged; Wikipedia was ignored
    expect(leads.map((l) => l.name).sort()).toEqual(["FIXTURE Grill", "FIXTURE Sweets"]);
    expect(c.leadsSaved).toBe(2);
    expect(c.duplicatesSkipped).toBeGreaterThanOrEqual(1);

    const grill = leads.find((l) => l.name === "FIXTURE Grill")!;
    expect(grill.verification).toBe("VERIFIED");
    expect(grill.domain).toBe("fixture-grill.example");
    expect(grill.whatsapp).toBe("966501234567");
    expect(grill.whatsappSource).toBe(`${SITE}/`);
    const ig = grill.socials.find((s) => s.platform === "instagram")!;
    expect(ig).toMatchObject({ handle: "fixturegrill", verified: true, sourceUrl: `${SITE}/` });
    expect(grill.sources.length).toBeGreaterThanOrEqual(2);

    // AI analysis: the sourced opportunity is kept, the invented one is dropped
    expect(grill.analyses).toHaveLength(1);
    expect(grill.signals.map((s) => s.title)).toEqual(["افتتاح فرع جديد"]);
    expect(grill.signals[0]).toMatchObject({ sourceUrl: `${SITE}/`, confidence: "HIGH", uncertain: false });
    expect(grill.score).toBeGreaterThanOrEqual(80);
    expect(grill.status).toBe("QUALIFIED");
    expect(grill.scores.length).toBeGreaterThan(0);

    const sweets = leads.find((l) => l.name === "FIXTURE Sweets")!;
    expect(sweets.verification).toBe("UNVERIFIED");
    expect(sweets.socials[0]).toMatchObject({ verified: false, sourceUrl: "https://www.instagram.com/fixture.sweets/" });
    expect(sweets.score).toBeLessThan(grill.score);

    const ai = await db.providerConnection.findFirstOrThrow({ where: { organizationId: orgId, kind: "AI" } });
    expect(ai.usedThisMonth).toBe(2);
    expect(ai.inputTokens).toBe(200);
  });

  it("does not pay for the same searches again on an immediate re-run", async () => {
    const before = search.mock.calls.length;
    const leadsBefore = await db.lead.count({ where: { organizationId: orgId } });
    await startCampaignRun(campaignId);
    await drainJobs();
    expect(search.mock.calls.length).toBe(before);
    expect(await db.lead.count({ where: { organizationId: orgId } })).toBe(leadsBefore);
    const skipped = await db.backgroundJob.findFirst({ where: { campaignId, status: "DONE", result: { path: ["skipped"], equals: "RECENTLY_EXECUTED" } } });
    expect(skipped).not.toBeNull();
  });

  it("generates a personalised message, prefills WhatsApp, and tracks manual sending", async () => {
    const grill = await db.lead.findFirstOrThrow({ where: { organizationId: orgId, name: "FIXTURE Grill" }, include: { socials: true } });
    const t = await generateMessageAction({ leadId: grill.id, style: "ar-sa", length: "medium", mode: "template" });
    expect(t.ok).toBe(true);
    expect(t.content).toContain("FIXTURE Grill");
    expect(t.content).toContain("افتتاح فرع جديد");

    chat.mockResolvedValueOnce({ text: "أهلاً بفريق FIXTURE Grill، مبروك افتتاح الفرع الجديد. معكم وكالة الاختبار ولدينا فكرة لفيديوهات قصيرة. يسعدنا مشاركتها معكم.", inputTokens: 80, outputTokens: 40 });
    const ai = await generateMessageAction({ leadId: grill.id, style: "ar-sa", length: "short", mode: "ai" });
    expect(ai).toMatchObject({ ok: true, source: "AI" });
    expect(chat.mock.calls.at(-1)![0].user).toContain("Evidenced signal: افتتاح فرع جديد");

    const saved = await saveMessageAction({ leadId: grill.id, content: ai.content!, style: "ar-sa", length: "short", source: "AI" });
    expect(saved.ok).toBe(true);
    expect((await db.lead.findUniqueOrThrow({ where: { id: grill.id } })).status).toBe("MESSAGE_READY");

    const link = buildWhatsAppLink(grill.whatsapp, ai.content!, grill.country)!;
    expect(link.startsWith("https://wa.me/966501234567?text=")).toBe(true);

    // Opening the contact is recorded but is NOT a sent message
    expect(await recordContactOpenedAction(grill.id, "whatsapp")).toMatchObject({ ok: true, status: "CONTACT_OPENED" });
    expect((await db.lead.findUniqueOrThrow({ where: { id: grill.id } })).status).toBe("CONTACT_OPENED");
    expect(await db.outreachActivity.count({ where: { leadId: grill.id, type: "MARKED_SENT" } })).toBe(0);
    expect(await db.lead.count({ where: { organizationId: orgId, status: "SENT_MANUALLY" } })).toBe(0);

    expect(await markSentAction(grill.id, "whatsapp")).toEqual({ ok: true });
    expect((await db.lead.findUniqueOrThrow({ where: { id: grill.id } })).status).toBe("SENT_MANUALLY");
    expect(await db.outreachActivity.count({ where: { leadId: grill.id, type: "MARKED_SENT" } })).toBe(1);
    expect(await db.auditLog.count({ where: { organizationId: orgId, action: "OUTREACH_MARK_SENT" } })).toBe(1);
  });

  it("reports CONFIGURATION REQUIRED when AI is not configured, and still drafts from a template", async () => {
    await db.providerConnection.updateMany({ where: { organizationId: orgId, kind: "AI" }, data: { enabled: false } });
    const sweets = await db.lead.findFirstOrThrow({ where: { organizationId: orgId, name: "FIXTURE Sweets" } });
    expect(await generateMessageAction({ leadId: sweets.id, style: "ar-pro", length: "short", mode: "ai" })).toMatchObject({ ok: false, error: "AI_NOT_CONFIGURED" });
    const t = await generateMessageAction({ leadId: sweets.id, style: "ar-pro", length: "short", mode: "template" });
    expect(t.ok).toBe(true);
    expect(t.content).not.toContain("مبروك"); // no evidenced signal, so no news is mentioned
    await db.providerConnection.updateMany({ where: { organizationId: orgId, kind: "AI" }, data: { enabled: true } });
  });
});

describe("Do Not Contact, permissions and quotas", () => {
  it("blocks outreach to Do Not Contact leads and keeps them out of future discovery", async () => {
    const sweets = await db.lead.findFirstOrThrow({ where: { organizationId: orgId, name: "FIXTURE Sweets" } });
    const fd = new FormData(); fd.set("id", sweets.id); fd.set("status", "DO_NOT_CONTACT");
    await expect(setStatusAction(fd)).rejects.toThrow(/REDIRECT:.*ok=SAVED/);
    expect(await recordContactOpenedAction(sweets.id, "instagram")).toMatchObject({ ok: false, error: "DNC_BLOCKED" });
    expect(await markSentAction(sweets.id, "instagram")).toMatchObject({ ok: false, error: "DNC_BLOCKED" });
    expect(await generateMessageAction({ leadId: sweets.id, style: "ar-sa", length: "short", mode: "template" })).toMatchObject({ ok: false, error: "DNC_BLOCKED" });
    await db.lead.delete({ where: { id: sweets.id } });
    const cand = hitToCandidate(FIXTURE_HITS[2], { provider: "tavily", query: "q", city: "الرياض", country: "Saudi Arabia", industry: "restaurants", category: "" })!;
    expect((await ingestCandidate(orgId, cand, null)).outcome).toBe("DO_NOT_CONTACT");
    expect(await db.lead.count({ where: { organizationId: orgId, name: "FIXTURE Sweets" } })).toBe(0);
  });

  it("limits employees to their assigned leads, on the server", async () => {
    const grill = await db.lead.findFirstOrThrow({ where: { organizationId: orgId, name: "FIXTURE Grill" } });
    const employee = await db.user.findUniqueOrThrow({ where: { id: employeeId } });
    expect(leadScope(employee)).toEqual({ organizationId: orgId, assignedToId: employeeId });
    expect(await db.lead.count({ where: leadWhere(employee, {}) })).toBe(0);
    state.user = employee;
    expect(await markSentAction(grill.id, "whatsapp")).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(await generateMessageAction({ leadId: grill.id, style: "ar-sa", length: "short", mode: "template" })).toMatchObject({ ok: false, error: "FORBIDDEN" });
    const fd = new FormData(); fd.set("name", "x"); fd.set("country", "Saudi Arabia"); fd.set("industry", "restaurants"); fd.set("targetCount", "5"); fd.set("minScore", "10");
    await expect(createCampaignAction(fd)).rejects.toThrow("REDIRECT:/?error=FORBIDDEN");
    const pf = new FormData(); pf.set("kind", "AI"); pf.set("provider", "openai"); pf.set("apiKey", "sk-stolen");
    await expect(saveProviderAction(pf)).rejects.toThrow("REDIRECT:/?error=FORBIDDEN");
    await db.lead.update({ where: { id: grill.id }, data: { assignedToId: employeeId } });
    expect(await db.lead.count({ where: leadWhere(employee, {}) })).toBe(1);
    expect((await generateMessageAction({ leadId: grill.id, style: "ar-sa", length: "short", mode: "template" })).ok).toBe(true);
    state.user = await db.user.findUniqueOrThrow({ where: { id: adminId } });
  });

  it("never lets one organisation touch another organisation's leads", async () => {
    const other = await db.organization.create({ data: { name: "FIXTURE Other Org" } });
    const foreign = await db.lead.create({ data: { organizationId: other.id, name: "FIXTURE Foreign", normalizedName: "fixture foreign" } });
    expect(await markSentAction(foreign.id, "whatsapp")).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(await db.lead.count({ where: leadWhere(state.user, { q: "Foreign" }) })).toBe(0);
    await db.organization.delete({ where: { id: other.id } });
  });

  it("stores API keys encrypted and never spends past the monthly limit", async () => {
    const fd = new FormData(); fd.set("kind", "SEARCH"); fd.set("provider", "brave"); fd.set("apiKey", "BSA-secret-value-9876"); fd.set("monthlyLimit", "2"); fd.set("enabled", "on");
    await expect(saveProviderAction(fd)).rejects.toThrow(/REDIRECT:\/providers\?ok=KEY_SAVED/);
    const row = await db.providerConnection.findFirstOrThrow({ where: { organizationId: orgId, provider: "brave" } });
    expect(row.encryptedKey).not.toContain("BSA-secret");
    expect(row.keyHint).toBe("••••9876");
    expect([await consumeQuota(row.id), await consumeQuota(row.id), await consumeQuota(row.id)]).toEqual([true, true, false]);
    expect((await db.providerConnection.findUniqueOrThrow({ where: { id: row.id } })).usedThisMonth).toBe(2);
    await db.providerConnection.delete({ where: { id: row.id } });
  });
});

describe("background jobs", () => {
  it("retries temporary failures with backoff and stops after the maximum attempts", async () => {
    await reset();
    await db.queryLog.deleteMany({});
    search.mockImplementation(async () => { throw new ProviderError("TEMPORARY", "FIXTURE outage"); });
    await startCampaignRun(campaignId);
    const first = (await claimNext())!;
    await runJob(first);
    let j = await db.backgroundJob.findUniqueOrThrow({ where: { id: first.id } });
    expect(j.status).toBe("PENDING");
    expect(j.attempts).toBe(1);
    expect(j.runAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(await db.backgroundJob.count({ where: { id: first.id } })).toBe(1);
    for (let i = 0; i < 2; i++) {
      await db.backgroundJob.update({ where: { id: first.id }, data: { runAt: new Date(0) } });
      await runJob((await claimNext())!);
    }
    j = await db.backgroundJob.findUniqueOrThrow({ where: { id: first.id } });
    expect(j.status).toBe("FAILED");
    expect(j.attempts).toBe(3);
    expect(j.error).toContain("FIXTURE outage");
  });

  it("does not retry an invalid key, and flags the provider", async () => {
    await reset();
    search.mockImplementation(async () => { throw new ProviderError("AUTH", "FIXTURE invalid key"); });
    await startCampaignRun(campaignId);
    await drainJobs();
    const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(c.status).toBe("FAILED");
    expect(c.lastError).toContain("FIXTURE invalid key");
    expect(search).toHaveBeenCalledTimes(1); // after the first failure the provider is no longer used
    expect((await db.providerConnection.findFirstOrThrow({ where: { organizationId: orgId, provider: "tavily" } })).lastStatus).toBe("AUTH_ERROR");
    expect(await db.lead.count({ where: { organizationId: orgId } })).toBe(0); // no fake results on failure
  });

  it("fails clearly when no provider is configured instead of inventing results", async () => {
    await reset();
    await db.providerConnection.deleteMany({ where: { organizationId: orgId } });
    const r = await startCampaignRun(campaignId);
    expect(r.jobs).toBe(0);
    expect(await db.campaign.findUniqueOrThrow({ where: { id: campaignId } })).toMatchObject({ status: "FAILED", lastError: "NO_PROVIDER_AVAILABLE" });
    expect(await db.lead.count({ where: { organizationId: orgId } })).toBe(0);
  });

  it("works with OpenStreetMap alone when no API key exists", async () => {
    await reset();
    await db.providerConnection.deleteMany({ where: { organizationId: orgId } });
    await ensureDefaultConnections(orgId);
    osmSearch.mockResolvedValue([{ title: "FIXTURE OSM Cafe", url: "https://www.openstreetmap.org/node/1", snippet: "", osm: { name: "FIXTURE OSM Cafe", city: "الرياض", phone: "+966112223334", socialUrls: ["https://www.instagram.com/fixture.osm.cafe"] } }]);
    const r = await startCampaignRun(campaignId);
    expect(r.jobs).toBe(1);
    expect(r.notes).toContain("NO_WEB_PROVIDER");
    await drainJobs();
    const lead = await db.lead.findFirstOrThrow({ where: { organizationId: orgId }, include: { socials: true, sources: true } });
    expect(lead).toMatchObject({ name: "FIXTURE OSM Cafe", verification: "LIKELY", phone: "966112223334" });
    expect(lead.sources[0].provider).toBe("osm");
    expect(lead.socials[0].sourceUrl).toBe("https://www.openstreetmap.org/node/1");
    expect(chat).not.toHaveBeenCalled();
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("COMPLETED");
  });

  it("pauses: jobs of a paused campaign are left untouched until it is resumed", async () => {
    await reset();
    await startCampaignRun(campaignId);
    state.user = await db.user.findUniqueOrThrow({ where: { id: adminId } });
    const fd = new FormData(); fd.set("id", campaignId);
    await expect(pauseCampaignAction(fd)).rejects.toThrow(/ok=PAUSED/);
    expect(await claimNext()).toBeNull();
    expect(search).not.toHaveBeenCalled();
    await db.campaign.update({ where: { id: campaignId }, data: { status: "RUNNING" } });
    expect(await claimNext()).not.toBeNull();
  });

  it("queues each job once, recovers crashed jobs and runs due scheduled campaigns", async () => {
    await reset();
    const a = await enqueue({ organizationId: orgId, type: "ENRICH", payload: { leadId: "x" }, dedupeKey: "fixture-key" });
    const b = await enqueue({ organizationId: orgId, type: "ENRICH", payload: { leadId: "x" }, dedupeKey: "fixture-key" });
    expect(a).not.toBeNull(); expect(b).toBeNull();
    const claimed = (await claimNext())!;
    expect(await claimNext()).toBeNull(); // a running job is never handed out twice
    await db.backgroundJob.update({ where: { id: claimed.id }, data: { lockedAt: new Date(Date.now() - 3600_000) } });
    expect(await recoverStaleJobs()).toBe(1);
    expect((await db.backgroundJob.findUniqueOrThrow({ where: { id: claimed.id } })).status).toBe("PENDING");
    await db.backgroundJob.deleteMany({});

    await db.campaign.update({ where: { id: campaignId }, data: { schedule: "DAILY", status: "COMPLETED", nextRunAt: new Date(Date.now() - 1000) } });
    expect(await runScheduler()).toBe(1);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("RUNNING");
    expect(await runScheduler()).toBe(0); // not started twice
    search.mockResolvedValue([]);
    await drainJobs();
    const done = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(done.status).toBe("COMPLETED");
    expect(done.nextRunAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
  });

  it("serverless mode: a time-boxed step runs due schedules and drains the queue without a worker process", async () => {
    await reset();
    await db.campaign.update({ where: { id: campaignId }, data: { schedule: "WEEKLY", status: "COMPLETED", nextRunAt: new Date(Date.now() - 1000) } });
    expect(await workFor(0, { housekeeping: true })).toMatchObject({ processed: 0 }); // zero budget: schedules start, nothing is processed
    expect(await db.backgroundJob.count({ where: { campaignId, status: "PENDING" } })).toBeGreaterThan(0);
    const r = await workFor(20_000);
    expect(r.processed).toBeGreaterThan(0);
    expect(r.remaining).toBe(0);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe("COMPLETED");
    expect(await db.lead.count({ where: { organizationId: orgId } })).toBe(2);
  });
});
