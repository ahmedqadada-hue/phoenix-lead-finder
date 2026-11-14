import Link from "next/link";
import { db } from "@/lib/db";
import { leadScope, requireUser } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { outreachProps } from "@/lib/leadView";
import { STATUS_LABEL, pick } from "@/lib/labels";
import { setStatusAction } from "@/actions/leads";
import { LeadOutreach } from "@/components/LeadOutreach";
import { LeadPicker } from "@/components/LeadPicker";
import { Flash } from "@/components/Flash";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "مساحة التواصل" };
const TABS: Record<string, string[]> = {
  ready: ["MESSAGE_READY", "CONTACT_OPENED"], qualified: ["QUALIFIED", "NEW"], sent: ["SENT_MANUALLY", "FOLLOW_UP"], replied: ["REPLIED", "INTERESTED"],
};

export default async function Outreach({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const { tr, locale } = await getTr();
  const tab = TABS[sp.tab] ? sp.tab : "ready";
  const scope = leadScope(u);
  const [counts, leads] = await Promise.all([
    db.lead.groupBy({ by: ["status"], where: scope, _count: true }),
    db.lead.findMany({ where: { ...scope, status: { in: TABS[tab] as any } }, orderBy: [{ score: "desc" }], take: 80, select: { id: true, name: true, city: true, score: true, status: true } }),
  ]);
  const n = (keys: string[]) => counts.filter((c) => keys.includes(c.status)).reduce((a, c) => a + c._count, 0);
  const selected = sp.lead && (await db.lead.findFirst({ where: { id: sp.lead, ...scope }, select: { id: true, name: true, status: true } }));
  const op = selected ? await outreachProps(selected.id, u.organizationId) : null;
  const tabs: [string, string][] = [["ready", tr("جاهزون للتواصل", "Ready to contact")], ["qualified", tr("بلا رسالة بعد", "No message yet")], ["sent", tr("أُرسل لهم", "Sent")], ["replied", tr("ردّوا", "Replied")]];
  return (
    <>
      <PageHeader title={tr("مساحة التواصل", "Outreach Workspace")} subtitle={tr("افتح قناة التواصل، أرسل الرسالة بنفسك، ثم أكّد الإرسال هنا. لا شيء يُرسَل تلقائياً.", "Open the channel, send the message yourself, then confirm it here. Nothing is ever sent automatically.")} />
      <Flash searchParams={sp} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {tabs.map(([k, label]) => <Link key={k} href={`/outreach?tab=${k}`} role="tab" aria-selected={tab === k} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === k ? "bg-charcoal text-white" : "border border-line bg-white text-gray-700 hover:bg-offwhite"}`}>{label} <span className="tabular-nums opacity-70">({n(TABS[k])})</span></Link>)}
      </div>
      {leads.length === 0 ? <Empty title={tr("لا يوجد عملاء في هذه المرحلة", "No leads at this stage")} text={tab === "ready" ? tr("احفظ رسالة لعميل من استوديو الرسائل ليظهر هنا.", "Save a message for a lead in Message Studio and it will appear here.") : undefined}>{tab === "ready" && <Link href="/messages" className="btn-primary">{tr("استوديو الرسائل", "Message Studio")}</Link>}</Empty> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <LeadPicker leads={leads} selected={selected ? selected.id : undefined} base="/outreach" locale={locale} extra={`&tab=${tab}`} />
          <div className="lg:col-span-2">
            {op && selected ? (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="h2">{selected.name}</h2><Link href={`/leads/${selected.id}`} className="text-sm font-semibold text-phoenix">{tr("تفاصيل العميل", "Lead details")}</Link></div>
                <LeadOutreach key={selected.id} {...op} locale={locale} />
                <form action={setStatusAction} className="card mt-4 flex flex-wrap items-end gap-2 p-4">
                  <input type="hidden" name="id" value={selected.id} /><input type="hidden" name="back" value={`/outreach?tab=${tab}&lead=${selected.id}`} />
                  <label className="block grow"><span className="label">{tr("تحديث الحالة يدوياً (بعد رد العميل مثلاً)", "Update status manually (e.g. after a reply)")}</span>
                    <select name="status" defaultValue={selected.status} className="input">{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v[locale]}</option>)}</select></label>
                  <button className="btn-dark">{tr("تحديث", "Update")}</button>
                </form>
              </>
            ) : <Empty title={tr("اختر عميلاً من القائمة", "Choose a lead from the list")} />}
          </div>
        </div>
      )}
    </>
  );
}
