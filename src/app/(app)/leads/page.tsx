import Link from "next/link";
import { db } from "@/lib/db";
import { isManager, requireUser } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { filterQuery, leadOrder, leadWhere } from "@/lib/leadFilters";
import { STATUS_LABEL, VERIFICATION_LABEL, pick } from "@/lib/labels";
import { industryLabel } from "@/lib/discovery/industries";
import { PLATFORM_LABEL, type Platform } from "@/lib/discovery/social";
import { addLeadAction, bulkAssignAction, importCsvAction } from "@/actions/leads";
import { Flash } from "@/components/Flash";
import { LeadFilters } from "@/components/LeadFilters";
import { Badge, Empty, PageHeader, Pager, ScoreBadge, fmtDate, statusTone, verificationTone } from "@/components/ui";

export const metadata = { title: "قاعدة العملاء" };
const PAGE = 25;

export default async function Leads({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const { tr, locale } = await getTr();
  const mgr = isManager(u);
  const where = leadWhere(u, sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const [total, leads, campaigns, users] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({ where, orderBy: leadOrder(sp.sort), skip: (page - 1) * PAGE, take: PAGE, include: { socials: { select: { platform: true } }, assignedTo: { select: { name: true } } } }),
    mgr ? db.campaign.findMany({ where: { organizationId: u.organizationId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }) : [],
    mgr ? db.user.findMany({ where: { organizationId: u.organizationId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const qs = filterQuery(sp, { page: undefined });
  return (
    <>
      <PageHeader title={tr("قاعدة العملاء", "Lead Database")} subtitle={mgr ? tr(`${total} نشاط مطابق للفلاتر.`, `${total} businesses match the filters.`) : tr(`${total} عميل مُسند إليك.`, `${total} leads assigned to you.`)}>
        {mgr && <a href={`/api/export/leads?${qs}`} className="btn-ghost">{tr("تصدير CSV", "Export CSV")}</a>}
      </PageHeader>
      <Flash searchParams={sp} />
      {sp.ok === "IMPORTED" && <div className="mb-4 rounded-lg border border-line bg-white p-3 text-sm">{tr(`جديد: ${sp.created ?? 0} · مدموج مع موجود: ${sp.merged ?? 0} · مُتجاهل: ${sp.skipped ?? 0}`, `New: ${sp.created ?? 0} · merged into existing: ${sp.merged ?? 0} · skipped: ${sp.skipped ?? 0}`)}</div>}
      <LeadFilters f={sp} tr={tr} locale={locale} campaigns={campaigns} users={users} action="/leads" />

      {mgr && (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <details className="card p-4"><summary className="cursor-pointer text-sm font-bold">{tr("إضافة نشاط يدوياً", "Add a business manually")}</summary>
            <form action={addLeadAction} className="mt-3 grid grid-cols-2 gap-3">
              <input name="name" required minLength={2} placeholder={tr("اسم النشاط *", "Business name *")} className="input col-span-2" />
              <input name="city" placeholder={tr("المدينة", "City")} className="input" /><input name="country" placeholder={tr("الدولة", "Country")} className="input" />
              <input name="website" placeholder={tr("الموقع الرسمي", "Official website")} className="input col-span-2" dir="ltr" />
              <input name="instagram" placeholder={tr("حساب أو رابط إنستغرام", "Instagram handle or link")} className="input" dir="ltr" /><input name="whatsapp" placeholder={tr("واتساب بالصيغة الدولية", "WhatsApp, international format")} className="input" dir="ltr" />
              <input type="hidden" name="industry" value="" /><input type="hidden" name="phone" value="" />
              <div className="col-span-2"><button className="btn-primary">{tr("إضافة والتحقق", "Add and verify")}</button></div>
            </form>
          </details>
          <details className="card p-4"><summary className="cursor-pointer text-sm font-bold">{tr("استيراد قائمة CSV", "Import a CSV list")}</summary>
            <form action={importCsvAction} className="mt-3 space-y-3">
              <input type="file" name="file" accept=".csv,text/csv" required className="input" />
              <p className="text-xs text-gray-500">{tr("الصف الأول عناوين. العمود المطلوب: name أو «الاسم». أعمدة اختيارية: city, country, industry, website, whatsapp, phone, instagram, facebook, linkedin, tiktok. حتى 1000 صف.", "First row is the header. Required column: name. Optional: city, country, industry, website, whatsapp, phone, instagram, facebook, linkedin, tiktok. Up to 1000 rows.")}</p>
              <button className="btn-primary">{tr("استيراد", "Import")}</button>
            </form>
          </details>
        </div>
      )}

      {leads.length === 0 ? (
        <Empty title={tr("لا توجد نتائج", "No results")} text={total === 0 && !qs ? tr("قاعدة العملاء فارغة. ابدأ حملة اكتشاف أو استورد قائمة.", "The lead database is empty. Start a discovery campaign or import a list.") : tr("لا يوجد عميل يطابق هذه الفلاتر.", "No lead matches these filters.")}>
          {mgr && <Link href="/discover" className="btn-primary">{tr("اكتشاف العملاء", "Discover Leads")}</Link>}
        </Empty>
      ) : (
        <form action={bulkAssignAction}>
          <input type="hidden" name="back" value={`/leads?${filterQuery(sp)}`} />
          <div className="card overflow-x-auto"><table className="w-full min-w-[860px]">
            <thead className="bg-offwhite"><tr>
              {mgr && <th className="th w-8"><span className="sr-only">{tr("تحديد", "Select")}</span></th>}
              <th className="th">{tr("النشاط", "Business")}</th><th className="th">{tr("التقييم", "Score")}</th><th className="th">{tr("التوثيق", "Verification")}</th>
              <th className="th">{tr("القنوات", "Channels")}</th><th className="th">{tr("الحالة", "Status")}</th>{mgr && <th className="th">{tr("المسؤول", "Assigned")}</th>}<th className="th">{tr("اكتُشف", "Discovered")}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">{leads.map((l) => { const platforms = [...new Set(l.socials.map((s) => s.platform))]; return (
              <tr key={l.id} className="hover:bg-offwhite">
                {mgr && <td className="td"><input type="checkbox" name="ids" value={l.id} aria-label={l.name} className="h-4 w-4 accent-phoenix" /></td>}
                <td className="td"><Link href={`/leads/${l.id}`} className="font-semibold hover:text-phoenix">{l.name}</Link><div className="text-xs text-gray-500">{[industryLabel(l.industry, locale), l.city].filter(Boolean).join(" · ") || "—"}</div></td>
                <td className="td"><ScoreBadge score={l.score} /></td>
                <td className="td"><Badge tone={verificationTone(l.verification)}>{pick(VERIFICATION_LABEL, l.verification, locale)}</Badge></td>
                <td className="td text-xs text-gray-600">{[l.whatsapp ? "WhatsApp" : null, ...platforms.map((p) => PLATFORM_LABEL[p as Platform] ?? p), l.website ? tr("موقع", "Website") : null].filter(Boolean).join(" · ") || "—"}</td>
                <td className="td"><Badge tone={statusTone(l.status)}>{pick(STATUS_LABEL, l.status, locale)}</Badge></td>
                {mgr && <td className="td text-xs">{l.assignedTo?.name ?? "—"}</td>}
                <td className="td whitespace-nowrap text-xs text-gray-500">{fmtDate(l.discoveredAt, locale)}</td>
              </tr>
            ); })}</tbody>
          </table></div>
          {mgr && users.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">{tr("إسناد المحدّدين إلى", "Assign selected to")}</span>
              <select name="assignedToId" className="input w-auto"><option value="">{tr("بدون مسؤول", "No one")}</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <button className="btn-ghost btn-sm">{tr("إسناد", "Assign")}</button>
            </div>
          )}
        </form>
      )}
      <Pager page={page} pages={Math.ceil(total / PAGE)} makeHref={(p) => `/leads?${filterQuery(sp, { page: p })}`} prev={tr("السابق", "Previous")} next={tr("التالي", "Next")} />
    </>
  );
}
