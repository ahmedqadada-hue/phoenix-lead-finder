import Link from "next/link";
import { db } from "@/lib/db";
import { isManager, requireUser } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { STATUS_LABEL, pick } from "@/lib/labels";
import { deleteFollowUpAction, toggleFollowUpAction } from "@/actions/followups";
import { Flash } from "@/components/Flash";
import { Badge, Empty, PageHeader, fmtDate, statusTone } from "@/components/ui";

export const metadata = { title: "المتابعات" };

export default async function FollowUps({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const { tr, locale } = await getTr();
  const done = sp.view === "done";
  const tasks = await db.followUpTask.findMany({
    where: { organizationId: u.organizationId, done, ...(isManager(u) ? {} : { OR: [{ assignedToId: u.id }, { lead: { assignedToId: u.id } }] }) },
    orderBy: { dueAt: done ? "desc" : "asc" }, take: 200, include: { lead: { select: { id: true, name: true, status: true } }, assignedTo: { select: { name: true } } },
  });
  const now = new Date();
  return (
    <>
      <PageHeader title={tr("المتابعات", "Follow-ups")} subtitle={tr("تذكيرات لمتابعة العملاء. أضف متابعة من صفحة أي عميل.", "Reminders to follow up with leads. Add one from any lead's page.")}>
        <Link href="/followups" className={!done ? "btn-dark btn-sm" : "btn-ghost btn-sm"}>{tr("المفتوحة", "Open")}</Link>
        <Link href="/followups?view=done" className={done ? "btn-dark btn-sm" : "btn-ghost btn-sm"}>{tr("المنجزة", "Done")}</Link>
      </PageHeader>
      <Flash searchParams={sp} />
      {tasks.length === 0 ? <Empty title={done ? tr("لا متابعات منجزة", "No completed follow-ups") : tr("لا متابعات مفتوحة", "No open follow-ups")} /> : (
        <div className="card divide-y divide-line">{tasks.map((t) => { const overdue = !t.done && t.dueAt < now; return (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <Link href={`/leads/${t.lead.id}`} className="text-sm font-semibold hover:text-phoenix">{t.lead.name}</Link> <Badge tone={statusTone(t.lead.status)}>{pick(STATUS_LABEL, t.lead.status, locale)}</Badge>
              <div className="mt-0.5 text-xs text-gray-600" dir="auto">{t.note || tr("بدون ملاحظة", "No note")}</div>
              <div className={`mt-0.5 text-xs ${overdue ? "font-bold text-red-700" : "text-gray-500"}`}>{overdue ? tr("متأخرة · ", "Overdue · ") : ""}{fmtDate(t.dueAt, locale)}{t.assignedTo ? ` · ${t.assignedTo.name}` : ""}</div>
            </div>
            <div className="flex gap-2">
              <form action={toggleFollowUpAction}><input type="hidden" name="id" value={t.id} /><button className="btn-ghost btn-sm">{t.done ? tr("إعادة فتح", "Reopen") : tr("تمت", "Mark done")}</button></form>
              <form action={deleteFollowUpAction}><input type="hidden" name="id" value={t.id} /><button className="btn-danger btn-sm">{tr("حذف", "Delete")}</button></form>
            </div>
          </div>
        ); })}</div>
      )}
    </>
  );
}
