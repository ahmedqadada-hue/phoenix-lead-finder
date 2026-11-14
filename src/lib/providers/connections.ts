import { db } from "../db";
import { decryptSecret } from "../crypto";
import { getSearchProvider, SEARCH_PROVIDERS } from "./search/registry";
import { AI_PROVIDERS, getAIProvider } from "./ai/registry";
import type { ProviderConnection } from "@prisma/client";

export const currentMonth = (d = new Date()) => d.toISOString().slice(0, 7);

/** OpenStreetMap needs no key, so every organisation starts with it enabled. */
export async function ensureDefaultConnections(organizationId: string) {
  await db.providerConnection.upsert({
    where: { organizationId_kind_provider: { organizationId, kind: "SEARCH", provider: "osm" } },
    update: {}, create: { organizationId, kind: "SEARCH", provider: "osm", enabled: true, monthlyLimit: 0, lastStatus: "UNTESTED" },
  });
}

export function remaining(c: ProviderConnection): number {
  if (!c.monthlyLimit) return Number.MAX_SAFE_INTEGER;
  const used = c.usageMonth === currentMonth() ? c.usedThisMonth : 0;
  return Math.max(0, c.monthlyLimit - used);
}

export function isUsable(c: ProviderConnection, requiresKey: boolean): boolean {
  return c.enabled && (!requiresKey || !!c.encryptedKey) && remaining(c) > 0 && c.lastStatus !== "AUTH_ERROR";
}

/** Atomically takes one unit of the monthly allowance. Returns false when the cap is reached,
 *  so the app can never spend past the limit the administrator set. */
export async function consumeQuota(id: string): Promise<boolean> {
  const month = currentMonth();
  await db.providerConnection.updateMany({ where: { id, usageMonth: { not: month } }, data: { usageMonth: month, usedThisMonth: 0, inputTokens: 0, outputTokens: 0 } });
  const n = await db.$executeRaw`UPDATE "ProviderConnection" SET "usedThisMonth" = "usedThisMonth" + 1 WHERE id = ${id} AND ("monthlyLimit" = 0 OR "usedThisMonth" < "monthlyLimit")`;
  return n === 1;
}

export async function recordStatus(id: string, status: string, error = "") {
  await db.providerConnection.update({ where: { id }, data: { lastStatus: status, lastError: error.slice(0, 500), lastTestedAt: new Date() } }).catch(() => {});
}

export function apiKeyOf(c: ProviderConnection): string | null {
  return c.encryptedKey ? decryptSecret(c.encryptedKey) : null;
}

/** Usable web-search connections, the one with most allowance left first (rotation). */
export async function usableWebProviders(organizationId: string) {
  const rows = await db.providerConnection.findMany({ where: { organizationId, kind: "SEARCH" } });
  return rows
    .map((c) => ({ c, p: getSearchProvider(c.provider) }))
    .filter((x) => x.p && x.p.kind === "web" && isUsable(x.c, x.p.requiresKey))
    .sort((a, b) => remaining(b.c) - remaining(a.c)) as { c: ProviderConnection; p: NonNullable<ReturnType<typeof getSearchProvider>> }[];
}

export async function usablePlacesProviders(organizationId: string) {
  const rows = await db.providerConnection.findMany({ where: { organizationId, kind: "SEARCH" } });
  return rows
    .map((c) => ({ c, p: getSearchProvider(c.provider) }))
    .filter((x) => x.p && x.p.kind === "places" && isUsable(x.c, x.p.requiresKey)) as { c: ProviderConnection; p: NonNullable<ReturnType<typeof getSearchProvider>> }[];
}

export async function usableAI(organizationId: string) {
  const rows = await db.providerConnection.findMany({ where: { organizationId, kind: "AI" } });
  const list = rows
    .map((c) => ({ c, p: getAIProvider(c.provider) }))
    .filter((x) => x.p && isUsable(x.c, true))
    .sort((a, b) => remaining(b.c) - remaining(a.c));
  return (list[0] as { c: ProviderConnection; p: NonNullable<ReturnType<typeof getAIProvider>> } | undefined) ?? null;
}

export { SEARCH_PROVIDERS, AI_PROVIDERS };
