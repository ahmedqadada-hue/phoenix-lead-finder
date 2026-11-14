"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { safeBack } from "@/lib/safeBack";
import { audit, isManager, leadScope, requireUser } from "@/lib/auth";

export async function createFollowUpAction(formData: FormData) {
  const u = await requireUser();
  const lead = await db.lead.findFirst({ where: { id: String(formData.get("leadId")), ...leadScope(u) } });
  if (!lead) redirect("/followups?error=FORBIDDEN");
  const due = new Date(String(formData.get("dueAt") ?? ""));
  const back = safeBack(formData.get("back"), "/followups");
  if (isNaN(due.getTime())) redirect(`${back}?error=INVALID_INPUT`);
  await db.followUpTask.create({ data: { organizationId: u.organizationId, leadId: lead.id, dueAt: due, note: String(formData.get("note") ?? "").slice(0, 500), assignedToId: lead.assignedToId ?? u.id } });
  if (["SENT_MANUALLY", "REPLIED", "CONTACT_OPENED"].includes(lead.status)) await db.lead.update({ where: { id: lead.id }, data: { status: "FOLLOW_UP" } });
  await audit(u, "FOLLOWUP_CREATE", "Lead", lead.id);
  redirect(`${back}?ok=SAVED`);
}

async function ownTask(id: string) {
  const u = await requireUser();
  const t = await db.followUpTask.findFirst({ where: { id, organizationId: u.organizationId, ...(isManager(u) ? {} : { OR: [{ assignedToId: u.id }, { lead: { assignedToId: u.id } }] }) } });
  if (!t) redirect("/followups?error=FORBIDDEN");
  return { u, t };
}

export async function toggleFollowUpAction(formData: FormData) {
  const { u, t } = await ownTask(String(formData.get("id")));
  await db.followUpTask.update({ where: { id: t.id }, data: { done: !t.done } });
  await audit(u, "FOLLOWUP_TOGGLE", "FollowUpTask", t.id);
  redirect("/followups");
}

export async function deleteFollowUpAction(formData: FormData) {
  const { u, t } = await ownTask(String(formData.get("id")));
  await db.followUpTask.delete({ where: { id: t.id } });
  await audit(u, "FOLLOWUP_DELETE", "FollowUpTask", t.id);
  redirect("/followups?ok=DELETED");
}
