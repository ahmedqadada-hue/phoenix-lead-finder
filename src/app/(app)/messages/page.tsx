import Link from "next/link";
import { db } from "@/lib/db";
import { leadScope, requireUser } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { outreachProps } from "@/lib/leadView";
import { LeadOutreach } from "@/components/LeadOutreach";
import { LeadPicker } from "@/components/LeadPicker";
import { Empty, PageHeader, fmtDate } from "@/components/ui";
import { STYLE_LABEL, pick } from "@/lib/labels";

export const metadata = { title: "استوديو الرسائل" };

export default async function Messages({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const { tr, locale } = await getTr();
  const q = sp.q?.trim();
  const leads = await db.lead.findMany({
    where: { ...leadScope(u), status: { notIn: ["DO_NOT_CONTACT", "NOT_INTERESTED", "CONVERTED"] }, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: [{ score: "desc" }], take: 60, select: { id: true, name: true, city: true, score: true, status: true },
  });
  const selected = sp.lead && (await db.lead.findFirst({ where: { id: sp.lead, ...leadScope(u) }, select: { id: true, name: true } }));
  const op = selected ? await outreachProps(selected.id, u.organizationId) : null;
  const history = selected ? await db.generatedMessage.findMany({ where: { leadId: selected.id, saved: true }, orderBy: { createdAt: "desc" }, take: 5 }) : [];
  return (
    <>
      <PageHeader title={tr("استوديو الرسائل", "Message Studio")} subtitle={tr("اكتب رسالة تعريفية مخصصة لكل عميل. تُحفظ للإرسال اليدوي فقط.", "Draft a personalised introduction for each lead. Messages are saved for manual sending only.")} />
      {leads.length === 0 && !q ? <Empty title={tr("لا يوجد عملاء لكتابة رسائل لهم", "No leads to write to yet")} text={tr("اكتشف عملاء أولاً ثم عد إلى هنا.", "Discover some leads first, then come back.")} /> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <form action="/messages" className="mb-3 flex gap-2"><input name="q" defaultValue={q ?? ""} placeholder={tr("ابحث باسم النشاط", "Search by business name")} className="input" /><button className="btn-ghost btn-sm">{tr("بحث", "Search")}</button></form>
            <LeadPicker leads={leads} selected={selected ? selected.id : undefined} base="/messages" locale={locale} />
          </div>
          <div className="lg:col-span-2">
            {op && selected ? (
              <>
                <div className="mb-3 flex items-center justify-between"><h2 className="h2">{selected.name}</h2><Link href={`/leads/${selected.id}`} className="text-sm font-semibold text-phoenix">{tr("تفاصيل العميل", "Lead details")}</Link></div>
                <LeadOutreach key={selected.id} {...op} locale={locale} />
                {history.length > 0 && <div className="card mt-4 p-4"><h3 className="h2">{tr("رسائل محفوظة سابقاً", "Previously saved messages")}</h3>
                  <ul className="mt-2 space-y-3">{history.map((m) => <li key={m.id} className="rounded-lg bg-offwhite p-3 text-sm"><div className="mb-1 text-xs text-gray-500">{pick(STYLE_LABEL, m.style, locale)} · {m.source} · {fmtDate(m.createdAt, locale, true)}</div><p className="whitespace-pre-wrap leading-7" dir="auto">{m.content}</p></li>)}</ul></div>}
              </>
            ) : <Empty title={tr("اختر عميلاً من القائمة", "Choose a lead from the list")} text={tr("ستظهر هنا أدوات كتابة الرسالة.", "The message tools will appear here.")} />}
          </div>
        </div>
      )}
    </>
  );
}
