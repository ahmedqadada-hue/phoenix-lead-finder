"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, leadScope, requireUser } from "@/lib/auth";
import { apiKeyOf, consumeQuota, recordStatus, usableAI } from "@/lib/providers/connections";
import { ProviderError } from "@/lib/providers/search/types";
import { MESSAGE_LENGTHS, MESSAGE_STYLES, MESSAGE_SYSTEM, buildMessagePrompt, renderCustomTemplate, renderTemplateMessage, validateMessage, type MessageIssue } from "@/lib/messages";
import { rateLimit } from "@/lib/ratelimit";
import { buildMessageContext } from "@/lib/messageContext";

const genSchema = z.object({
  leadId: z.string().min(1), style: z.enum(MESSAGE_STYLES), length: z.enum(MESSAGE_LENGTHS),
  mode: z.enum(["ai", "template", "custom"]), templateId: z.string().optional(), service: z.string().max(120).optional(),
});

export interface GenerateResult { ok: boolean; content?: string; source?: "AI" | "TEMPLATE"; issues?: MessageIssue[]; error?: string; detail?: string }

/** Drafts a message. It is only ever shown to the user for manual sending: nothing is sent from here. */
export async function generateMessageAction(input: z.infer<typeof genSchema>): Promise<GenerateResult> {
  const u = await requireUser();
  const p = genSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "INVALID_INPUT" };
  const d = p.data;
  const lead = await db.lead.findFirst({ where: { id: d.leadId, ...leadScope(u) }, select: { id: true, status: true } });
  if (!lead) return { ok: false, error: "FORBIDDEN" };
  if (lead.status === "DO_NOT_CONTACT") return { ok: false, error: "DNC_BLOCKED" };
  const ctx = await buildMessageContext(d.leadId, u.organizationId, d.service);
  if (!ctx) return { ok: false, error: "FORBIDDEN" };

  if (d.mode === "template") {
    const content = renderTemplateMessage(ctx, d.style, d.length);
    return { ok: true, content, source: "TEMPLATE", issues: validateMessage(content, ctx, d.length) };
  }
  if (d.mode === "custom") {
    const t = await db.messageTemplate.findFirst({ where: { id: d.templateId ?? "", organizationId: u.organizationId } });
    if (!t) return { ok: false, error: "INVALID_INPUT" };
    const content = renderCustomTemplate(t.content, ctx);
    return { ok: true, content, source: "TEMPLATE", issues: validateMessage(content, ctx, d.length).filter((i) => i.code !== "TOO_SHORT" && i.code !== "TOO_LONG") };
  }
  if (!rateLimit(`msg:${u.id}`, 30, 10 * 60_000).ok) return { ok: false, error: "RATE_LIMIT" };
  const ai = await usableAI(u.organizationId);
  if (!ai) return { ok: false, error: "AI_NOT_CONFIGURED" };
  if (!(await consumeQuota(ai.c.id))) return { ok: false, error: "AI_LIMIT_REACHED" };
  const org = await db.organization.findUniqueOrThrow({ where: { id: u.organizationId }, select: { writingStyle: true } });
  try {
    const out = await ai.p.chat({ apiKey: apiKeyOf(ai.c)!, model: ai.c.model || ai.p.defaultModel, system: MESSAGE_SYSTEM, user: buildMessagePrompt(ctx, d.style, d.length, org.writingStyle) });
    await recordStatus(ai.c.id, "OK");
    await db.providerConnection.update({ where: { id: ai.c.id }, data: { inputTokens: { increment: out.inputTokens }, outputTokens: { increment: out.outputTokens } } });
    const content = out.text.trim().replace(/^["“]|["”]$/g, "");
    const issues = validateMessage(content, ctx, d.length);
    if (issues.some((i) => i.code === "EMPTY")) return { ok: false, error: "AI_EMPTY" };
    return { ok: true, content, source: "AI", issues };
  } catch (e) {
    if (e instanceof ProviderError) await recordStatus(ai.c.id, e.kind === "AUTH" ? "AUTH_ERROR" : e.kind === "QUOTA" ? "QUOTA_EXHAUSTED" : "ERROR", e.message);
    return { ok: false, error: "AI_ERROR", detail: e instanceof Error ? e.message.slice(0, 200) : "" };
  }
}

const saveSchema = z.object({ leadId: z.string().min(1), content: z.string().trim().min(1).max(4000), style: z.enum(MESSAGE_STYLES), length: z.enum(MESSAGE_LENGTHS), source: z.enum(["AI", "TEMPLATE", "MANUAL"]) });

export async function saveMessageAction(input: z.infer<typeof saveSchema>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const u = await requireUser();
  const p = saveSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "INVALID_INPUT" };
  const d = p.data;
  const lead = await db.lead.findFirst({ where: { id: d.leadId, ...leadScope(u) } });
  if (!lead) return { ok: false, error: "FORBIDDEN" };
  const m = await db.generatedMessage.create({ data: { leadId: lead.id, content: d.content, language: d.style === "en" ? "en" : "ar", style: d.style, length: d.length, source: d.source, saved: true, createdById: u.id } });
  if (lead.status === "NEW" || lead.status === "QUALIFIED") await db.lead.update({ where: { id: lead.id }, data: { status: "MESSAGE_READY" } });
  await audit(u, "MESSAGE_SAVE", "Lead", lead.id, { source: d.source });
  return { ok: true, id: m.id };
}
