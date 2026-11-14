"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit, requireRole } from "@/lib/auth";
import { encryptSecret, keyHint, decryptSecret } from "@/lib/crypto";
import { getSearchProvider } from "@/lib/providers/search/registry";
import { getAIProvider } from "@/lib/providers/ai/registry";
import { ProviderError } from "@/lib/providers/search/types";
import { rateLimit } from "@/lib/ratelimit";

function target(kind: string) { return kind === "AI" ? "/ai" : "/providers"; }

/** Saves a provider connection. The key is encrypted before it touches the database and is never sent back to the browser. */
export async function saveProviderAction(formData: FormData) {
  const u = await requireRole("ADMIN");
  const kind = formData.get("kind") === "AI" ? "AI" : "SEARCH";
  const id = String(formData.get("provider") ?? "");
  const def = kind === "AI" ? getAIProvider(id) : getSearchProvider(id);
  if (!def) redirect(`${target(kind)}?error=INVALID_INPUT`);
  const key = String(formData.get("apiKey") ?? "").trim();
  if (key.length > 400) redirect(`${target(kind)}?error=INVALID_INPUT`);
  const limit = Math.max(0, Math.min(1_000_000, Math.floor(Number(formData.get("monthlyLimit") ?? def.defaultMonthlyLimit) || 0)));
  const model = String(formData.get("model") ?? "").trim().slice(0, 100);
  const enabled = formData.get("enabled") === "on";
  let enc: { encryptedKey: string; keyHint: string; lastStatus: string; lastError: string } | undefined;
  if (key) {
    try { enc = { encryptedKey: encryptSecret(key), keyHint: keyHint(key), lastStatus: "UNTESTED", lastError: "" }; }
    catch { redirect(`${target(kind)}?error=ENCRYPTION_KEY_MISSING`); }
  }
  await db.providerConnection.upsert({
    where: { organizationId_kind_provider: { organizationId: u.organizationId, kind, provider: id } },
    update: { enabled, monthlyLimit: limit, model, ...(enc ?? {}) },
    create: { organizationId: u.organizationId, kind, provider: id, enabled, monthlyLimit: limit, model, ...(enc ?? {}) },
  });
  await audit(u, "PROVIDER_SAVE", "ProviderConnection", id, { kind, keyChanged: !!key, enabled, limit });
  redirect(`${target(kind)}?ok=${key ? "KEY_SAVED" : "SAVED"}`);
}

export async function removeProviderKeyAction(formData: FormData) {
  const u = await requireRole("ADMIN");
  const kind = formData.get("kind") === "AI" ? "AI" : "SEARCH";
  const id = String(formData.get("provider") ?? "");
  await db.providerConnection.updateMany({ where: { organizationId: u.organizationId, kind, provider: id }, data: { encryptedKey: null, keyHint: "", lastStatus: "UNTESTED", lastError: "", enabled: false } });
  await audit(u, "PROVIDER_KEY_REMOVE", "ProviderConnection", id, { kind });
  redirect(`${target(kind)}?ok=DELETED`);
}

/** Makes one real call to the provider and stores the outcome. Nothing is reported as working unless this succeeds. */
export async function testProviderAction(formData: FormData) {
  const u = await requireRole("ADMIN");
  const kind = formData.get("kind") === "AI" ? "AI" : "SEARCH";
  const id = String(formData.get("provider") ?? "");
  if (!rateLimit(`test:${u.id}`, 20, 10 * 60_000).ok) redirect(`${target(kind)}?error=RATE_LIMIT`);
  const conn = await db.providerConnection.findUnique({ where: { organizationId_kind_provider: { organizationId: u.organizationId, kind, provider: id } } });
  const def = kind === "AI" ? getAIProvider(id) : getSearchProvider(id);
  if (!def) redirect(`${target(kind)}?error=INVALID_INPUT`);
  const needsKey = kind === "AI" || (getSearchProvider(id)?.requiresKey ?? true);
  if (needsKey && !conn?.encryptedKey) redirect(`${target(kind)}?error=KEY_REQUIRED`);
  const row = conn ?? (await db.providerConnection.create({ data: { organizationId: u.organizationId, kind, provider: id, enabled: true } }));
  let status = "OK", error = "", models: string[] = [];
  try {
    const key = row.encryptedKey ? decryptSecret(row.encryptedKey) : null;
    if (kind === "AI") {
      const ai = getAIProvider(id)!;
      models = await ai.listModels(key!);
      const out = await ai.chat({ apiKey: key!, model: row.model || ai.defaultModel, system: "Reply with the single word: ok", user: "ping" });
      if (!out.text.trim()) throw new ProviderError("TEMPORARY", "The model returned an empty reply");
    } else await getSearchProvider(id)!.test(key);
  } catch (e) {
    status = e instanceof ProviderError ? (e.kind === "AUTH" ? "AUTH_ERROR" : e.kind === "QUOTA" ? "QUOTA_EXHAUSTED" : "ERROR") : "ERROR";
    error = e instanceof Error ? e.message : String(e);
  }
  await db.providerConnection.update({ where: { id: row.id }, data: { lastStatus: status, lastError: error.slice(0, 500), lastTestedAt: new Date() } });
  await audit(u, "PROVIDER_TEST", "ProviderConnection", id, { kind, status });
  redirect(`${target(kind)}?${status === "OK" ? "ok=TEST_OK" : "error=TEST_FAILED"}${models.length ? `&models=${encodeURIComponent(models.slice(0, 60).join(","))}&for=${id}` : ""}`);
}
