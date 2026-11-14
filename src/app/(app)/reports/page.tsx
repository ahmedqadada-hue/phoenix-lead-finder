import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { filterQuery, leadWhere } from "@/lib/leadFilters";
import { STATUS_LABEL, VERIFICATION_LABEL, pick } from "@/lib/labels";
import { industryLabel } from "@/lib/discovery/industries";
import { LEAD_STATUSES, SENT_STATUSES } from "@/lib/outreach";
import { PLATFORM_LABEL, type Platform } from "@/lib/discovery/social";
import { getSearchProvider } from "@/lib/providers/search/registry";
import { LeadFilters } from "@/components/LeadFilters";
import { Empty, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "التقارير" };

function Table({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <section><h2 className="h2 mb-2">{title}</h2>
      <div className="card overflow-x-auto"><table className="w-full">
        <thead className="bg-offwhite"><tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`td ${j ? "tabular-nums" : "font-medium"}`}>{c}</td>)}</tr>)}</tbody>
      </table></div>
    </section>
  );
}

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireRole("ADMIN", "MANAGER");
  const { tr, locale } = await getTr();
  const where = leadWhere(u, sp);
  const [total, byStatus, byVerification, byIndustry, byCity, byCampaign, scoreBands, campaigns, users, ids] = await Promise.all([
    db.lead.count({ where }),
    db.lead.groupBy({ by: ["status"], where, _count: true }),
    db.lead.groupBy({ by: ["verification"], where, _count: true }),
    db.lead.groupBy({ by: ["industry"], where, _count: true, _avg: { score: true }, orderBy: { _count: { industry: "desc" } }, take: 12 }),
    db.lead.groupBy({ by: ["city"], where, _count: true, _avg: { score: true }, orderBy: { _count: { city: "desc" } }, take: 12 }),
    db.lead.groupBy({ by: ["campaignId"], where, _count: true, _avg: { score: true } }),
    Promise.all([db.lead.count({ where: { AND: [where, { score: { gte: 80 } }] } }), db.lead.count({ where: { AND: [where, { score: { gte: 60, lt: 80 } }] } }), db.lead.count({ where: { AND: [where, { score: { lt: 60 } }] } })]),
    db.campaign.findMany({ where: { organizationId: u.organizationId }, select: { id: true, name: true } }),
    db.user.findMany({ where: { organizationId: u.organizationId, active: true }, select: { id: true, name: true } }),
    db.lead.findMany({ where, select: { id: true }, take: 20000 }),
  ]);
  const leadIds = ids.map((x) => x.id);
  const [byPlatform, whatsapp, bySource, opened, markedSent] = await Promise.all([
    db.leadSocialAccount.groupBy({ by: ["platform"], where: { leadId: { in: leadIds } }, _count: true }),
    db.lead.count({ where: { AND: [where, { whatsapp: { not: null } }] } }),
    db.discoverySource.groupBy({ by: ["provider"], where: { leadId: { in: leadIds } }, _count: true }),
    db.outreachActivity.count({ where: { leadId: { in: leadIds }, type: "CONTACT_OPENED" } }),
    db.outreachActivity.count({ where: { leadId: { in: leadIds }, type: "MARKED_SENT" } }),
  ]);
  const st = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;
  const sent = SENT_STATUSES.reduce((a, s) => a + st(s), 0);
  const replied = st("REPLIED") + st("INTERESTED") + st("NOT_INTERESTED") + st("CONVERTED");
  const pctOf = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const avg = (v: number | null) => (v == null ? "—" : Math.round(v));
  return (
    <>
      <PageHeader title={tr("التقارير", "Reports")} subtitle={tr("تُحسب من سجلات قاعدة البيانات الفعلية بحسب الفلاتر أدناه.", "Calculated from real database records for the filters below.")}>
        <a href={`/api/export/leads?${filterQuery(sp)}`} className="btn-primary">{tr("تصدير CSV", "Export CSV")}</a>
      </PageHeader>
      <LeadFilters f={sp} tr={tr} locale={locale} campaigns={campaigns} users={users} action="/reports" showSort={false} />
      {total === 0 ? <Empty title={tr("لا بيانات مطابقة", "No matching data")} text={tr("لا يوجد عملاء يطابقون هذه الفلاتر.", "No leads match these filters.")} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label={tr("العملاء", "Leads")} value={total} />
            <Stat label={tr("فُتحت جهة اتصال", "Contact opened")} value={opened} hint={tr("عدد مرات الفتح، لا يُحسب إرسالاً", "Open events; not counted as sent")} />
            <Stat label={tr("تأكيدات إرسال يدوية", "Manual send confirmations")} value={markedSent} />
            <Stat label={tr("عملاء أُرسل لهم", "Leads contacted")} value={sent} hint={pctOf(sent, total)} />
            <Stat label={tr("ردّوا", "Replied")} value={replied} hint={`${pctOf(replied, sent)} ${tr("ممن أُرسل لهم", "of contacted")}`} />
            <Stat label={tr("تحوّلوا", "Converted")} value={st("CONVERTED")} hint={`${pctOf(st("CONVERTED"), sent)} ${tr("ممن أُرسل لهم", "of contacted")}`} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Table title={tr("حسب حالة التواصل", "By outreach status")} head={[tr("الحالة", "Status"), tr("العدد", "Count")]} rows={LEAD_STATUSES.filter((s) => st(s) > 0).map((s) => [pick(STATUS_LABEL, s, locale), st(s)])} />
            <Table title={tr("حسب التقييم", "By score")} head={[tr("الفئة", "Band"), tr("العدد", "Count")]} rows={[[tr("أولوية عالية (80–100)", "High (80–100)"), scoreBands[0]], [tr("متوسطة (60–79)", "Medium (60–79)"), scoreBands[1]], [tr("منخفضة (أقل من 60)", "Low (below 60)"), scoreBands[2]]]} />
            <Table title={tr("حسب التوثيق", "By verification")} head={[tr("المستوى", "Level"), tr("العدد", "Count")]} rows={byVerification.map((v) => [pick(VERIFICATION_LABEL, v.verification, locale), v._count])} />
            <Table title={tr("حسب المنصة", "By platform")} head={[tr("المنصة", "Platform"), tr("عملاء لهم حساب", "Leads with an account")]} rows={[["WhatsApp", whatsapp], ...byPlatform.sort((a, b) => b._count - a._count).map((p) => [PLATFORM_LABEL[p.platform as Platform] ?? p.platform, p._count] as (string | number)[])]} />
            <Table title={tr("حسب المجال", "By industry")} head={[tr("المجال", "Industry"), tr("العدد", "Count"), tr("متوسط التقييم", "Avg score")]} rows={byIndustry.map((i) => [industryLabel(i.industry, locale) || "—", i._count, avg(i._avg.score)])} />
            <Table title={tr("حسب المدينة", "By city")} head={[tr("المدينة", "City"), tr("العدد", "Count"), tr("متوسط التقييم", "Avg score")]} rows={byCity.map((c) => [c.city || "—", c._count, avg(c._avg.score)])} />
            <Table title={tr("حسب الحملة", "By campaign")} head={[tr("الحملة", "Campaign"), tr("العدد", "Count"), tr("متوسط التقييم", "Avg score")]} rows={byCampaign.map((c) => [campaigns.find((x) => x.id === c.campaignId)?.name ?? tr("بدون حملة", "No campaign"), c._count, avg(c._avg.score)])} />
            <Table title={tr("أداء المصادر", "Source performance")} head={[tr("المصدر", "Source"), tr("سجلات المصدر", "Source records")]} rows={bySource.sort((a, b) => b._count - a._count).map((s) => [getSearchProvider(s.provider)?.label ?? (s.provider === "manual" ? tr("إدخال يدوي", "Manual entry") : s.provider === "csv" ? "CSV" : s.provider), s._count])} />
          </div>
        </>
      )}
    </>
  );
}
