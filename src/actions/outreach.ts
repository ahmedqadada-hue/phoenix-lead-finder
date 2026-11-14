"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit, leadScope, requireUser } from "@/lib/auth";
import { statusAfterContactOpened, type LeadStatusValue } from "@/lib/outreach";

/** Records that the user opened a contact destination. This is NOT counted as a sent message. */
export async function recordContactOpenedAction(leadId: string, platform: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const u = await requireUser();
  const lead = await db.lead.findFirst({ where: { id: leadId, ...leadScope(u) } });
  if (!lead) return { ok: false, error: "FORBIDDEN" };
  if (lead.status === "DO_NOT_CONTACT") return { ok: false, error: "DNC_BLOCKED" };
  const status = statusAfterContactOpened(lead.status as LeadStatusValue);
  await db.$transaction([
    db.lead.update({ where: { id: lead.id }, data: { status } }),
    db.outreachActivity.create({ data: { leadId: lead.id, userId: u.id, type: "CONTACT_OPENED", platform: platform.slice(0, 20) } }),
  ]);
  revalidatePath("/outreach");
  return { ok: true, status };
}

/** The human confirms they pressed Send themselves. Only this action marks a message as sent. */
export async function markSentAction(leadId: string, platform: string): Promise<{ ok: boolean; error?: string }> {
  const u = await requireUser();
  const lead = await db.lead.findFirst({ where: { id: leadId, ...leadScope(u) } });
  if (!lead) return { ok: false, error: "FORBIDDEN" };
  if (lead.status === "DO_NOT_CONTACT") return { ok: false, error: "DNC_BLOCKED" };
  await db.$transaction([
    db.lead.update({ where: { id: lead.id }, data: { status: "SENT_MANUALLY" } }),
    db.outreachActivity.create({ data: { leadId: lead.id, userId: u.id, type: "MARKED_SENT", platform: platform.slice(0, 20), detail: `${lead.status} → SENT_MANUALLY` } }),
  ]);
  await audit(u, "OUTREACH_MARK_SENT", "Lead", lead.id, { platform });
  revalidatePath("/outreach");
  return { ok: true };
}
