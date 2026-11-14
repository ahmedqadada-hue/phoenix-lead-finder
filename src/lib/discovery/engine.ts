// The discovery engine: campaign runs, candidate ingestion with duplicate
// prevention, website enrichment + identity verification, AI analysis and scoring.
import type { BackgroundJob, Campaign, Prisma } from "@prisma/client";
import { db } from "../db";
import { claimNext, completeJob, enqueue, failJob } from "../jobs";
import { apiKeyOf, consumeQuota, recordStatus, usableAI, usablePlacesProviders, usableWebProviders } from "../providers/connections";
import { getSearchProvider } from "../providers/search/registry";
import { ProviderError } from "../providers/search/types";
import { ANALYSIS_SYSTEM, buildAnalysisPrompt, validateAnalysis, type AnalysisMaterial } from "../providers/ai/analysis";
import { scoreLead, type ScoringWeights } from "../scoring";
import { hitToCandidate, keywordSignals, type Candidate } from "./candidates";
import { findDuplicate, type IdentityKeys } from "./dedupe";
import { findCountry, findIndustry } from "./industries";
import { cleanTitleToName, getDomain, normalizeName } from "./normalize";
import { generateQueries } from "./queries";
import { computeVerification } from "./verify";
import { fetchSite } from "./website";

const WEB_CACHE_HOURS = 6 * 24; // an identical web query is not paid for twice within 6 days
const OSM_CACHE_HOURS = 20;

type Json = Prisma.InputJsonValue;

// ---------------------------------------------------------------- campaign runs

export async function startCampaignRun(campaignId: string): Promise<{ jobs: number; notes: string[] }> {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const notes: string[] = [];
  const run = c.runNumber + 1;
  await db.backgroundJob.updateMany({ where: { campaignId, status: "PENDING" }, data: { status: "CANCELLED", finishedAt: new Date() } });

  const specs: { payload: Json; key: string }[] = [];
  const places = await usablePlacesProviders(c.organizationId);
  const ind = findIndustry(c.industry);
  const country = findCountry(c.country);
  if (places.length) {
    if (!ind || !ind.osm.length) notes.push("OSM_INDUSTRY_UNSUPPORTED");
    else if (!country) notes.push("OSM_COUNTRY_UNSUPPORTED");
    else if (!c.cities.length) notes.push("OSM_CITY_REQUIRED");
    else for (const city of c.cities) specs.push({ payload: { provider: "osm", city, run }, key: `s:${campaignId}:${run}:osm:${city}` });
  }
  const web = await usableWebProviders(c.organizationId);
  if (!web.length) notes.push("NO_WEB_PROVIDER");
  else {
    const queries = generateQueries({ country: c.country, cities: c.cities, industry: c.industry, category: c.category, services: c.services, language: c.language, targetCount: c.targetCount });
    queries.forEach((q, i) => specs.push({ payload: { query: q.query, kind: q.kind, city: q.city, run }, key: `s:${campaignId}:${run}:q${i}` }));
  }

  if (!specs.length) {
    await db.campaign.update({ where: { id: campaignId }, data: { status: "FAILED", lastError: "NO_PROVIDER_AVAILABLE", lastNote: notes.join(","), lastRunAt: new Date(), runNumber: run, queriesTotal: 0, queriesDone: 0 } });
    return { jobs: 0, notes };
  }
  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "RUNNING", runNumber: run, lastRunAt: new Date(), lastError: null, lastNote: notes.join(","), queriesTotal: specs.length, queriesDone: 0, candidatesFound: 0, leadsSaved: 0, duplicatesSkipped: 0, nextRunAt: null },
  });
  for (const s of specs) await enqueue({ organizationId: c.organizationId, type: "SEARCH", payload: s.payload, campaignId, dedupeKey: s.key });
  return { jobs: specs.length, notes };
}

export function nextRunDate(schedule: string, from = new Date()): Date | null {
  if (schedule === "DAILY") return new Date(from.getTime() + 24 * 3600_000);
  if (schedule === "WEEKLY") return new Date(from.getTime() + 7 * 24 * 3600_000);
  return null;
}

export async function finalizeCampaignIfDone(campaignId: string) {
  const open = await db.backgroundJob.count({ where: { campaignId, status: { in: ["PENDING", "RUNNING"] } } });
  if (open > 0) return;
  const c = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!c || c.status !== "RUNNING") return;
  const searchJobs = await db.backgroundJob.findMany({ where: { campaignId, type: "SEARCH", payload: { path: ["run"], equals: c.runNumber } }, select: { status: true, result: true, error: true, finishedAt: true } });
  // A search only counts as carried out if it really ran (or was deliberately skipped to save quota).
  const UNPRODUCTIVE = ["NO_WEB_PROVIDER_OR_QUOTA_REACHED", "QUOTA_REACHED", "PROVIDER_DISABLED"];
  const productive = searchJobs.filter((j) => j.status === "DONE" && !UNPRODUCTIVE.includes(String((j.result as any)?.skipped ?? ""))).length;
  const failedJobs = searchJobs.filter((j) => j.status === "FAILED").sort((x, y) => (y.finishedAt?.getTime() ?? 0) - (x.finishedAt?.getTime() ?? 0));
  const blocked = searchJobs.find((j) => j.status === "DONE" && UNPRODUCTIVE.includes(String((j.result as any)?.skipped ?? "")));
  const allFailed = productive === 0 && searchJobs.length > 0;
  const lastError: string | null = failedJobs[0]?.error ?? (allFailed && blocked ? String((blocked.result as any).skipped) : null);
  await db.campaign.update({ where: { id: campaignId }, data: { status: allFailed ? "FAILED" : "COMPLETED", lastError, nextRunAt: nextRunDate(c.schedule) } });
}

/** Starts scheduled (daily / weekly) campaigns that are due. Runs inside the worker. */
export async function runScheduler(now = new Date()): Promise<number> {
  const due = await db.campaign.findMany({ where: { schedule: { not: "MANUAL" }, status: { in: ["COMPLETED", "FAILED"] }, nextRunAt: { lte: now } } });
  for (const c of due) await startCampaignRun(c.id);
  return due.length;
}

// ---------------------------------------------------------------- ingestion + dedupe

function identityOf(c: { name: string; city: string; domain: string | null; socials: { platform: string; handle: string }[] }): IdentityKeys {
  return { normalizedName: normalizeName(c.name), city: c.city, domain: c.domain, socials: c.socials.map((s) => ({ platform: s.platform, handle: s.handle })) };
}

export type IngestResult = { outcome: "CREATED" | "MERGED" | "DO_NOT_CONTACT"; leadId?: string };

export async function ingestCandidate(organizationId: string, cand: Candidate, campaign: Pick<Campaign, "id" | "minScore"> | null, assignedToId: string | null = null): Promise<IngestResult> {
  const keys = identityOf(cand);
  const handles = cand.socials.map((s) => s.handle);
  const result = await db.$transaction(async (tx) => {
    // One ingestion at a time per organisation: two workers can never create the same business twice.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;

    const dnc = await tx.doNotContact.findFirst({
      where: { organizationId, OR: [...(cand.domain ? [{ domain: cand.domain }] : []), ...(handles.length ? [{ handle: { in: handles } }] : []), { name: keys.normalizedName, domain: null, handle: null }] },
    });
    if (dnc) return { outcome: "DO_NOT_CONTACT" as const };

    const possible = await tx.lead.findMany({
      where: {
        organizationId,
        OR: [
          ...(cand.domain ? [{ domain: cand.domain }] : []),
          { normalizedName: keys.normalizedName },
          ...(cand.socials.length ? [{ socials: { some: { OR: cand.socials.map((s) => ({ platform: s.platform, handle: s.handle })) } } }] : []),
        ],
      },
      include: { socials: true, sources: { select: { url: true } } },
      take: 50,
    });
    const dup = findDuplicate(keys, possible.map((l) => ({ ...l, id: l.id, socials: l.socials })));
    if (dup) {
      const lead = dup.match;
      if (!lead.sources.some((s) => s.url === cand.source.url)) {
        await tx.discoverySource.create({ data: { leadId: lead.id, provider: cand.source.provider, url: cand.source.url, title: cand.source.title, snippet: cand.source.snippet, query: cand.source.query } });
      }
      for (const s of cand.socials) {
        if (!lead.socials.some((o) => o.platform === s.platform && o.handle === s.handle)) {
          await tx.leadSocialAccount.create({ data: { leadId: lead.id, platform: s.platform, url: s.url, handle: s.handle, sourceUrl: s.sourceUrl, verified: false } }).catch(() => {});
        }
      }
      const gainedWebsite = !lead.website && !!cand.website;
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          website: lead.website ?? cand.website, domain: lead.domain ?? cand.domain, phone: lead.phone ?? cand.phone,
          whatsapp: lead.whatsapp ?? cand.whatsapp, whatsappSource: lead.whatsappSource ?? cand.whatsappSource, lastCheckedAt: new Date(),
        },
      });
      return { outcome: "MERGED" as const, leadId: lead.id, gainedWebsite };
    }
    const lead = await tx.lead.create({
      data: {
        organizationId, campaignId: campaign?.id ?? null, name: cand.name, normalizedName: keys.normalizedName,
        industry: cand.industry, category: cand.category, country: cand.country, city: cand.city,
        website: cand.website, domain: cand.domain, phone: cand.phone, whatsapp: cand.whatsapp, whatsappSource: cand.whatsappSource,
        description: cand.description, assignedToId,
        socials: { create: cand.socials.map((s) => ({ platform: s.platform, url: s.url, handle: s.handle, sourceUrl: s.sourceUrl, verified: false })) },
        sources: { create: [{ provider: cand.source.provider, url: cand.source.url, title: cand.source.title, snippet: cand.source.snippet, query: cand.source.query }] },
      },
    });
    return { outcome: "CREATED" as const, leadId: lead.id, gainedWebsite: false };
  });
  if (result.outcome === "CREATED" || (result.outcome === "MERGED" && result.gainedWebsite)) {
    await enqueue({ organizationId, type: "ENRICH", payload: { leadId: result.leadId! }, campaignId: campaign?.id ?? null, dedupeKey: `e:${result.leadId}:${Date.now()}` });
  }
  return { outcome: result.outcome, leadId: result.leadId };
}

// ---------------------------------------------------------------- job handlers

async function handleSearch(job: BackgroundJob): Promise<Json> {
  const p = job.payload as { provider?: string; query?: string; city?: string; kind?: string };
  const c = await db.campaign.findUnique({ where: { id: job.campaignId ?? "" } });
  if (!c) return { skipped: "CAMPAIGN_DELETED" };
  if (c.leadsSaved >= c.targetCount) return { skipped: "TARGET_REACHED" };

  const country = findCountry(c.country);
  const isOsm = p.provider === "osm";
  const pick = isOsm ? (await usablePlacesProviders(c.organizationId))[0] : (await usableWebProviders(c.organizationId))[0];
  if (!pick) return { skipped: isOsm ? "PROVIDER_DISABLED" : "NO_WEB_PROVIDER_OR_QUOTA_REACHED" };
  const { c: conn, p: provider } = pick;

  const cacheKey = isOsm ? `osm:${country?.code ?? ""}:${p.city}:${c.industry}` : p.query!;
  const since = new Date(Date.now() - (isOsm ? OSM_CACHE_HOURS : WEB_CACHE_HOURS) * 3600_000);
  const recent = await db.queryLog.findFirst({ where: { organizationId: c.organizationId, query: cacheKey, executedAt: { gte: since } } });
  if (recent) return { skipped: "RECENTLY_EXECUTED", provider: recent.provider };

  if (!(await consumeQuota(conn.id))) return { skipped: "QUOTA_REACHED", provider: provider.id };
  let hits;
  try {
    hits = await provider.search({ query: p.query ?? "", city: p.city ?? "", countryCode: country?.code ?? "", industry: c.industry, language: c.language, limit: isOsm ? Math.min(400, c.targetCount * 3) : 20 }, apiKeyOf(conn));
    await recordStatus(conn.id, "OK");
  } catch (e) {
    if (e instanceof ProviderError) {
      await recordStatus(conn.id, e.kind === "AUTH" ? "AUTH_ERROR" : e.kind === "QUOTA" ? "QUOTA_EXHAUSTED" : "ERROR", e.message);
      if (e.kind === "QUOTA") await db.providerConnection.update({ where: { id: conn.id }, data: { usedThisMonth: conn.monthlyLimit || 0 } });
    }
    throw e;
  }
  await db.queryLog.create({ data: { organizationId: c.organizationId, provider: provider.id, query: cacheKey, results: hits.length } });

  let created = 0, merged = 0, ignored = 0, candidates = 0;
  for (const hit of hits) {
    const fresh = await db.campaign.findUnique({ where: { id: c.id }, select: { leadsSaved: true, status: true } });
    if (!fresh || fresh.leadsSaved >= c.targetCount) break;
    const cand = hitToCandidate(hit, { provider: provider.id, query: isOsm ? cacheKey : p.query!, city: p.city ?? "", country: c.country, industry: c.industry, category: c.category });
    if (!cand) { ignored++; continue; }
    candidates++;
    const r = await ingestCandidate(c.organizationId, cand, c);
    if (r.outcome === "CREATED") { created++; await db.campaign.update({ where: { id: c.id }, data: { leadsSaved: { increment: 1 } } }); }
    else if (r.outcome === "MERGED") merged++;
    else ignored++;
  }
  await db.campaign.update({ where: { id: c.id }, data: { candidatesFound: { increment: candidates }, duplicatesSkipped: { increment: merged } } });
  return { provider: provider.id, results: hits.length, created, merged, ignored };
}

/** Recomputes and stores the explainable score of a lead. */
export async function rescoreLead(leadId: string): Promise<number> {
  const lead = await db.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { socials: true, signals: true, organization: { select: { scoringWeights: true } }, campaign: { select: { industry: true, minScore: true } }, analyses: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const res = scoreLead({
    industryMatchesCampaign: !!lead.campaign && lead.campaign.industry === lead.industry && !!lead.industry,
    hasDescription: !!lead.description, aiFit: lead.analyses[0]?.businessFit ?? null,
    signals: lead.signals.map((s) => ({ confidence: s.confidence, uncertain: s.uncertain })),
    verification: lead.verification, hasWebsite: !!lead.website, hasWhatsapp: !!lead.whatsapp, hasPhone: !!lead.phone,
    socials: lead.socials.map((s) => ({ platform: s.platform, verified: s.verified })), lastCheckedAt: lead.lastCheckedAt,
  }, lead.organization.scoringWeights as Partial<ScoringWeights> | null);
  const qualifies = lead.status === "NEW" && res.total >= (lead.campaign?.minScore ?? 60);
  await db.$transaction([
    db.lead.update({ where: { id: leadId }, data: { score: res.total, ...(qualifies ? { status: "QUALIFIED" } : {}) } }),
    db.leadScore.create({ data: { leadId, total: res.total, factors: res.factors as unknown as Json, method: lead.analyses[0] ? "AI" : "RULES" } }),
  ]);
  return res.total;
}

async function mergeInto(targetId: string, fromId: string, campaignId: string | null) {
  const from = await db.lead.findUniqueOrThrow({ where: { id: fromId }, include: { socials: true, sources: true } });
  const target = await db.lead.findUniqueOrThrow({ where: { id: targetId }, include: { socials: true, sources: true } });
  await db.$transaction(async (tx) => {
    for (const s of from.sources) if (!target.sources.some((t) => t.url === s.url)) await tx.discoverySource.create({ data: { leadId: targetId, provider: s.provider, url: s.url, title: s.title, snippet: s.snippet, query: s.query } });
    for (const s of from.socials) if (!target.socials.some((t) => t.platform === s.platform && t.handle === s.handle)) await tx.leadSocialAccount.create({ data: { leadId: targetId, platform: s.platform, url: s.url, handle: s.handle, sourceUrl: s.sourceUrl, verified: s.verified } });
    await tx.lead.update({ where: { id: targetId }, data: { website: target.website ?? from.website, domain: target.domain ?? from.domain, phone: target.phone ?? from.phone, whatsapp: target.whatsapp ?? from.whatsapp, whatsappSource: target.whatsappSource ?? from.whatsappSource, lastCheckedAt: new Date() } });
    await tx.lead.delete({ where: { id: fromId } });
    if (campaignId) await tx.campaign.update({ where: { id: campaignId }, data: { leadsSaved: { decrement: 1 }, duplicatesSkipped: { increment: 1 } } }).catch(() => {});
  });
}

async function handleEnrich(job: BackgroundJob): Promise<Json> {
  const { leadId } = job.payload as { leadId: string };
  let lead = await db.lead.findUnique({ where: { id: leadId }, include: { socials: true, sources: true } });
  if (!lead) return { skipped: "LEAD_GONE" };
  const fromOsm = lead.sources.some((s) => s.provider === "osm");
  const manual = lead.sources.some((s) => s.provider === "manual" || s.provider === "csv");
  let siteText = ""; let siteUrl = lead.website ?? ""; let siteTitles: string[] = []; let fetched = false; let siteError: string | undefined;

  if (lead.website) {
    const site = await fetchSite(lead.website, lead.country);
    siteError = site.error;
    if (site.ok) {
      fetched = true; siteText = site.textSample; siteUrl = site.finalUrl; siteTitles = site.titles;
      const siteName = cleanTitleToName(site.siteName);
      const data: Prisma.LeadUpdateInput = { lastCheckedAt: new Date() };
      if (!fromOsm && !manual && siteName.length >= 2) { data.name = siteName; data.normalizedName = normalizeName(siteName); }
      if (!lead.description && site.description) data.description = site.description;
      if (!lead.logoUrl && site.logoUrl) data.logoUrl = site.logoUrl;
      if (!lead.phone && site.phones[0]) data.phone = site.phones[0];
      const wa = site.socials.find((s) => s.platform === "whatsapp");
      if (wa) { data.whatsapp = wa.handle; data.whatsappSource = wa.sourceUrl; }
      await db.lead.update({ where: { id: leadId }, data });
      for (const s of site.socials) {
        if (s.platform === "whatsapp") continue;
        await db.leadSocialAccount.upsert({
          where: { leadId_platform_handle: { leadId, platform: s.platform, handle: s.handle } },
          update: { verified: true, sourceUrl: s.sourceUrl, url: s.url },
          create: { leadId, platform: s.platform, handle: s.handle, url: s.url, sourceUrl: s.sourceUrl, verified: true },
        });
      }
      lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { socials: true, sources: true } });

      // The website may reveal that this is a business we already hold under another record.
      const others = await db.lead.findMany({
        where: { organizationId: lead.organizationId, id: { not: leadId }, OR: [...(lead.domain ? [{ domain: lead.domain }] : []), ...(lead.socials.length ? [{ socials: { some: { OR: lead.socials.map((s) => ({ platform: s.platform, handle: s.handle })) } } }] : [])] },
        include: { socials: true }, orderBy: { discoveredAt: "asc" }, take: 20,
      });
      const dup = others.length ? findDuplicate(identityOf(lead), others) : null;
      if (dup && (dup.reason === "DOMAIN" || dup.reason === "SOCIAL")) {
        await mergeInto(dup.match.id, leadId, lead.campaignId);
        await enqueue({ organizationId: lead.organizationId, type: "ENRICH", payload: { leadId: dup.match.id }, campaignId: job.campaignId, dedupeKey: `e:${dup.match.id}:${Date.now()}` });
        return { merged: dup.match.id, reason: dup.reason };
      }
    }
  }

  const v = computeVerification({
    name: lead.name, domain: lead.domain, websiteFetched: fetched, siteTitles,
    socialsFromWebsite: lead.socials.filter((s) => s.verified).length + (lead.whatsappSource && lead.whatsappSource === siteUrl ? 1 : 0),
    hasOsmRecord: fromOsm, independentSources: new Set(lead.sources.map((s) => s.provider)).size,
    socialsFromSearchOnly: lead.socials.filter((s) => !s.verified).length,
  });
  await db.lead.update({ where: { id: leadId }, data: { verification: v.status, verificationNotes: [...v.notes, ...(siteError ? [`SITE_${siteError}`] : [])].join(","), lastCheckedAt: new Date() } });

  // Evidence-quoting keyword hints from the business's own pages / profiles only.
  const own = lead.sources.filter((s) => (lead!.domain && getDomain(s.url) === lead!.domain) || lead!.socials.some((x) => s.url.toLowerCase().includes(`/${x.handle}`)));
  const texts = own.map((s) => ({ text: `${s.title}. ${s.snippet}`, url: s.url }));
  if (siteText) texts.push({ text: siteText, url: siteUrl });
  const existing = await db.opportunitySignal.findMany({ where: { leadId }, select: { title: true } });
  const locale = /[؀-ۿ]/.test(lead.name + lead.description) ? "ar" : "en";
  for (const s of keywordSignals(texts, locale)) {
    if (existing.some((e) => e.title === s.title)) continue;
    await db.opportunitySignal.create({ data: { leadId, title: s.title, explanation: s.explanation, evidence: s.evidence, sourceUrl: s.sourceUrl, suggestedService: s.suggestedService, confidence: "LOW", uncertain: true } });
  }

  const score = await rescoreLead(leadId);
  let analysis = "NOT_CONFIGURED";
  if (await usableAI(lead.organizationId)) {
    await enqueue({ organizationId: lead.organizationId, type: "ANALYZE", payload: { leadId, siteText: siteText.slice(0, 3500), siteUrl }, campaignId: job.campaignId, dedupeKey: `a:${leadId}:${Date.now()}` });
    analysis = "QUEUED";
  }
  return { verification: v.status, score, website: fetched ? "FETCHED" : (siteError ?? "NONE"), analysis };
}

async function handleAnalyze(job: BackgroundJob): Promise<Json> {
  const { leadId, siteText, siteUrl } = job.payload as { leadId: string; siteText?: string; siteUrl?: string };
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { sources: true, organization: true, campaign: true } });
  if (!lead) return { skipped: "LEAD_GONE" };
  const ai = await usableAI(lead.organizationId);
  if (!ai) return { skipped: "AI_NOT_CONFIGURED_OR_LIMIT_REACHED" };
  if (!(await consumeQuota(ai.c.id))) return { skipped: "AI_LIMIT_REACHED" };

  const locale = /[؀-ۿ]/.test(lead.name + lead.description) || lead.campaign?.language === "ar" ? "ar" : "en";
  const material: AnalysisMaterial = {
    company: { name: lead.name, industry: lead.industry, city: lead.city, country: lead.country, website: lead.website, verification: lead.verification },
    agencyServices: lead.organization.agencyServices, targetServices: lead.campaign?.services ?? [], locale,
    sources: [
      ...lead.sources.filter((s) => s.url && (s.title || s.snippet)).slice(0, 8).map((s) => ({ url: s.url, title: s.title, text: s.snippet })),
      ...(siteText && siteUrl ? [{ url: siteUrl, title: "Official website", text: siteText }] : []),
    ],
  };
  const model = ai.c.model || ai.p.defaultModel;
  let out;
  try {
    out = await ai.p.chat({ apiKey: apiKeyOf(ai.c)!, model, system: ANALYSIS_SYSTEM, user: buildAnalysisPrompt(material), json: true });
    await recordStatus(ai.c.id, "OK");
  } catch (e) {
    if (e instanceof ProviderError) await recordStatus(ai.c.id, e.kind === "AUTH" ? "AUTH_ERROR" : e.kind === "QUOTA" ? "QUOTA_EXHAUSTED" : "ERROR", e.message);
    throw e;
  }
  await db.providerConnection.update({ where: { id: ai.c.id }, data: { inputTokens: { increment: out.inputTokens }, outputTokens: { increment: out.outputTokens } } });
  const a = validateAnalysis(out.text, material);
  await db.$transaction([
    db.opportunitySignal.deleteMany({ where: { leadId } }),
    db.opportunitySignal.createMany({ data: a.opportunities.map((o) => ({ leadId, title: o.title, explanation: o.explanation, evidence: o.evidence, sourceUrl: o.sourceUrl, publishedAt: o.publishedAt, suggestedService: o.suggestedService, confidence: o.confidence, uncertain: o.uncertain })) }),
    db.aIAnalysis.create({ data: { leadId, provider: ai.p.id, model, summary: a.summary, suggestedServices: a.suggestedServices, insufficientEvidence: a.insufficientEvidence, businessFit: a.businessFit, fitReason: a.fitReason, inputTokens: out.inputTokens, outputTokens: out.outputTokens } }),
  ]);
  const score = await rescoreLead(leadId);
  return { provider: ai.p.id, model, opportunities: a.opportunities.length, dropped: a.dropped, score };
}

const HANDLERS: Record<string, (job: BackgroundJob) => Promise<Json>> = { SEARCH: handleSearch, ENRICH: handleEnrich, ANALYZE: handleAnalyze };

/** Runs one claimed job to completion, handling retries and campaign bookkeeping. */
export async function runJob(job: BackgroundJob): Promise<void> {
  try {
    const handler = HANDLERS[job.type];
    if (!handler) throw new ProviderError("BAD_REQUEST", `Unknown job type ${job.type}`);
    const result = await handler(job);
    await completeJob(job.id, result);
    if (job.type === "SEARCH" && job.campaignId) await db.campaign.update({ where: { id: job.campaignId }, data: { queriesDone: { increment: 1 } } }).catch(() => {});
  } catch (e) {
    const retryable = e instanceof ProviderError ? e.retryable || e.kind === "QUOTA" : !(e instanceof Error && /^AI_INVALID/.test(e.message));
    const outcome = await failJob(job, e instanceof Error ? e.message : String(e), retryable);
    if (outcome === "FAILED" && job.type === "SEARCH" && job.campaignId) await db.campaign.update({ where: { id: job.campaignId }, data: { queriesDone: { increment: 1 } } }).catch(() => {});
  }
  if (job.campaignId) await finalizeCampaignIfDone(job.campaignId).catch(() => {});
}

/** Processes queued jobs until none are due (used by the worker loop and by tests). */
export async function drainJobs(max = 500): Promise<number> {
  let n = 0;
  while (n < max) {
    const job = await claimNext();
    if (!job) break;
    await runJob(job);
    n++;
  }
  return n;
}

/** Serverless-friendly worker step: housekeeping, then jobs until the time budget is used.
 *  Used where no long-running worker process exists (for example Vercel). */
export async function workFor(budgetMs: number, opts: { housekeeping?: boolean } = {}): Promise<{ processed: number; remaining: number }> {
  const deadline = Date.now() + budgetMs;
  if (opts.housekeeping) {
    const { recoverStaleJobs } = await import("../jobs");
    await recoverStaleJobs();
    await runScheduler();
  }
  let processed = 0;
  while (Date.now() < deadline) {
    const job = await claimNext();
    if (!job) break;
    await runJob(job);
    processed++;
  }
  const remaining = await db.backgroundJob.count({ where: { status: "PENDING", runAt: { lte: new Date() }, OR: [{ campaignId: null }, { campaign: { status: "RUNNING" } }] } });
  return { processed, remaining };
}
