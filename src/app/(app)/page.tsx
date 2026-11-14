import Link from "next/link";
import { db } from "@/lib/db";
import { isManager, leadScope, requireUser } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { providerReadiness } from "@/lib/providerStatus";
import { SENT_STATUSES } from "@/lib/outreach";
import { getSearchProvider } from "@/lib/providers/search/registry";
import { Badge, ConfigRequired, Empty, PageHeader, ScoreBadge, Stat, fmtDate, statusTone } from "@/components/ui";
import { Flash } from "@/components/Flash";
import { InstallHelp } from "@/components/Client";
import { STATUS_LABEL, pick } from "@/lib/labels";

export const metadata = { title: "لوحة التحكم" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const { tr, locale } = await getTr();
  const scope = leadScope(u);
  const week = new Date(Date.now() - 7 * 86400_000), day = new Date(Date.now() - 86400_000);
  const mgr = isManager(u);
  const [total, fresh, verified, high, prepared, contacted, replied, interested, converted, recent, ready, dueFollowUps] = await Promise.all([
    db.lead.count({ where: scope }),
    db.lead.count({ where: { ...scope, discoveredAt: { gte: week } } }),
    db.lead.count({ where: { ...scope, verification: "VERIFIED" } }),
    db.lead.count({ where: { ...scope, score: { gte: 80 } } }),
    db.lead.count({ where: { ...scope, messages: { some: { saved: true } } } }),
    db.lead.count({ where: { ...scope, status: { in: SENT_STATUSES } } }),
    db.lead.count({ where: { ...scope, status: { in: ["REPLIED", "INTERESTED", "NOT_INTERESTED", "CONVERTED"] } } }),
    db.lead.count({ where: { ...scope, status: "INTERESTED" } }),
    db.lead.count({ where: { ...scope, status: "CONVERTED" } }),
    db.lead.findMany({ where: scope, orderBy: [{ score: "desc" }, { discoveredAt: "desc" }], take: 6, select: { id: true, name: true, city: true, score: true, status: true, discoveredAt: true } }),
    providerReadiness(u.organizationId),
    db.followUpTask.count({ where: { organizationId: u.organizationId, done: false, dueAt: { lte: new Date() }, ...(mgr ? {} : { assignedToId: u.id }) } }),
  ]);
  const jobs = mgr ? await db.backgroundJob.groupBy({ by: ["status"], where: { organizationId: u.organizationId, createdAt: { gte: day } }, _count: true }) : [];
  const jobCount = (s: string) => jobs.find((j) => j.status === s)?._count ?? 0;
  const sources = mgr ? await db.$queryRaw<{ provider: string; leads: bigint; strong: bigint }[]>`
    SELECT s.provider, COUNT(DISTINCT l.id) AS leads, COUNT(DISTINCT l.id) FILTER (WHERE l.score >= 60) AS strong
    FROM "DiscoverySource" s JOIN "Lead" l ON l.id = s."leadId" WHERE l."organizationId" = ${u.organizationId} GROUP BY s.provider ORDER BY leads DESC` : [];
  const srcName = (p: string) => getSearchProvider(p)?.label ?? (p === "manual" ? tr("إدخال يدوي", "Manual entry") : p === "csv" ? tr("استيراد CSV", "CSV import") : p);

  return (
    <>
      <PageHeader title={tr("لوحة التحكم", "Dashboard")} subtitle={tr("كل الأرقام هنا محسوبة مباشرة من قاعدة البيانات.", "Every number here is counted live from the database.")}>
        {mgr && <Link href="/discover" className="btn-primary">{tr("بدء اكتشاف جديد", "Start a new discovery")}</Link>}
      </PageHeader>
      <Flash searchParams={sp} />
      {mgr && !ready.hasWeb && <ConfigRequired title={tr("بحث الويب وإنستغرام: يتطلب إعداداً", "Web & Instagram search: CONFIGURATION REQUIRED")} text={tr("يعمل الآن الاكتشاف من OpenStreetMap ومواقع الشركات واستيراد CSV. لاكتشاف حسابات إنستغرام وأخبار الافتتاحات أضف مفتاح بحث واحداً على الأقل.", "Discovery currently works from OpenStreetMap, business websites and CSV import. Add at least one web-search key to find Instagram accounts and opening news.")} href={u.role === "ADMIN" ? "/providers" : undefined} cta={tr("مزودو البحث", "Search Providers")} />}
      {mgr && !ready.hasAI && <ConfigRequired title={tr("التحليل والرسائل بالذكاء الاصطناعي: يتطلب إعداداً", "AI analysis & messages: CONFIGURATION REQUIRED")} text={tr("التقييم يعمل بالقواعد والرسائل بالقوالب. أضف مفتاح مزود ذكاء اصطناعي لتفعيل التحليل والرسائل المخصصة.", "Scoring runs on rules and messages on templates. Add an AI provider key to enable analysis and personalised messages.")} href={u.role === "ADMIN" ? "/ai" : undefined} cta={tr("اتصالات الذكاء الاصطناعي", "AI Connections")} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label={tr("إجمالي العملاء", "Total Leads")} value={total} href="/leads" />
        <Stat label={tr("اكتُشفوا خلال 7 أيام", "Newly Discovered (7d)")} value={fresh} href="/leads?sort=new" />
        <Stat label={tr("هوية موثّقة", "Verified Leads")} value={verified} href="/leads?verification=VERIFIED" />
        <Stat label={tr("أولوية عالية (80+)", "High Priority (80+)")} value={high} href="/leads?minScore=80" />
        <Stat label={tr("رسائل محفوظة", "Messages Prepared")} value={prepared} hint={tr("عملاء لهم رسالة محفوظة", "Leads with a saved message")} />
        <Stat label={tr("أُرسل لهم يدوياً", "Manually Contacted")} value={contacted} hint={tr("بتأكيد يدوي فقط، فتح الرابط لا يُحسب", "Manual confirmations only; opened links are not counted")} />
        <Stat label={tr("ردّوا", "Replied")} value={replied} />
        <Stat label={tr("مهتمون", "Interested")} value={interested} href="/leads?status=INTERESTED" />
        <Stat label={tr("تحوّلوا إلى عملاء", "Converted")} value={converted} href="/leads?status=CONVERTED" />
        <Stat label={tr("متابعات مستحقة", "Follow-ups due")} value={dueFollowUps} href="/followups" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="h2 mb-3">{tr("أعلى العملاء تقييماً", "Top-scoring leads")}</h2>
          {recent.length === 0 ? (
            <Empty title={tr("لا يوجد عملاء بعد", "No leads yet")} text={tr("ابدأ حملة اكتشاف أو استورد قائمة. لن تظهر هنا أي بيانات وهمية.", "Start a discovery campaign or import a list. No sample data is ever shown here.")}>
              {mgr && <Link href="/discover" className="btn-primary">{tr("اكتشاف العملاء", "Discover Leads")}</Link>}
            </Empty>
          ) : (
            <div className="card divide-y divide-line">
              {recent.map((l) => (
                <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-offwhite">
                  <div className="min-w-0"><div className="truncate text-sm font-semibold">{l.name}</div><div className="text-xs text-gray-500">{l.city || "—"} · {fmtDate(l.discoveredAt, locale)}</div></div>
                  <div className="flex shrink-0 items-center gap-2"><Badge tone={statusTone(l.status)}>{pick(STATUS_LABEL, l.status, locale)}</Badge><ScoreBadge score={l.score} /></div>
                </Link>
              ))}
            </div>
          )}
        </section>
        <div className="space-y-6">
          {mgr && (
            <section>
              <h2 className="h2 mb-3">{tr("مهام الاكتشاف (آخر 24 ساعة)", "Discovery jobs (last 24h)")}</h2>
              <Link href="/jobs" className="card grid grid-cols-4 divide-x divide-line text-center rtl:divide-x-reverse">
                {[["PENDING", tr("انتظار", "Pending")], ["RUNNING", tr("تنفيذ", "Running")], ["DONE", tr("تمت", "Done")], ["FAILED", tr("فشلت", "Failed")]].map(([k, label]) => (
                  <div key={k} className="p-3"><div className="text-lg font-bold tabular-nums">{jobCount(k)}</div><div className="text-xs text-gray-500">{label}</div></div>
                ))}
              </Link>
            </section>
          )}
          {mgr && (
            <section>
              <h2 className="h2 mb-3">{tr("أداء المصادر", "Source performance")}</h2>
              {sources.length === 0 ? <div className="card p-4 text-sm text-gray-500">{tr("لا بيانات بعد.", "No data yet.")}</div> : (
                <div className="card overflow-hidden"><table className="w-full">
                  <thead className="bg-offwhite"><tr><th className="th">{tr("المصدر", "Source")}</th><th className="th">{tr("عملاء", "Leads")}</th><th className="th">{tr("تقييم 60+", "Score 60+")}</th></tr></thead>
                  <tbody className="divide-y divide-line">{sources.map((s) => <tr key={s.provider}><td className="td">{srcName(s.provider)}</td><td className="td tabular-nums">{Number(s.leads)}</td><td className="td tabular-nums">{Number(s.strong)}</td></tr>)}</tbody>
                </table></div>
              )}
            </section>
          )}
          <section>
            <h2 className="h2 mb-3">{tr("تثبيت التطبيق على جهازك", "Install the app on your device")}</h2>
            <div className="card p-4"><InstallHelp locale={locale} /></div>
          </section>
        </div>
      </div>
    </>
  );
}
