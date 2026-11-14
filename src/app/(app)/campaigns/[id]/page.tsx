import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { CAMPAIGN_STATUS_LABEL, JOB_STATUS_LABEL, JOB_TYPE_LABEL, NOTE_LABEL, SKIP_LABEL, STATUS_LABEL, VERIFICATION_LABEL, pick } from "@/lib/labels";
import { deleteCampaignAction, duplicateCampaignAction, pauseCampaignAction, resumeCampaignAction, startCampaignAction, updateCampaignAction } from "@/actions/campaigns";
import { CampaignFields } from "@/components/CampaignForm";
import { Flash } from "@/components/Flash";
import { AutoRefresh, ConfirmButton } from "@/components/Client";
import { Badge, PageHeader, ScoreBadge, Stat, fmtDate, statusTone, verificationTone } from "@/components/ui";

export const metadata = { title: "تفاصيل الحملة" };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const u = await requireRole("ADMIN", "MANAGER");
  const { tr, locale } = await getTr();
  const c = await db.campaign.findFirst({ where: { id, organizationId: u.organizationId } });
  if (!c) notFound();
  const [leads, qualified, jobs, org] = await Promise.all([
    db.lead.findMany({ where: { campaignId: c.id }, orderBy: [{ score: "desc" }], take: 50, select: { id: true, name: true, city: true, score: true, status: true, verification: true } }),
    db.lead.count({ where: { campaignId: c.id, score: { gte: c.minScore } } }),
    db.backgroundJob.findMany({ where: { campaignId: c.id }, orderBy: { createdAt: "desc" }, take: 40 }),
    db.organization.findUniqueOrThrow({ where: { id: u.organizationId } }),
  ]);
  const running = c.status === "RUNNING";
  const pct = c.queriesTotal ? Math.round((c.queriesDone / c.queriesTotal) * 100) : 0;
  const notes = c.lastNote.split(",").filter(Boolean);
  const jobTone = (s: string) => (s === "DONE" ? "green" : s === "FAILED" ? "red" : s === "RUNNING" ? "orange" : "gray");
  const describe = (j: (typeof jobs)[number]) => {
    const p = j.payload as any, r = (j.result ?? {}) as any;
    const what = j.type === "SEARCH" ? (p.provider === "osm" ? `OpenStreetMap · ${p.city}` : p.query) : "";
    const out = r.skipped ? pick(SKIP_LABEL, r.skipped, locale) : j.type === "SEARCH" && j.status === "DONE" ? tr(`${r.results ?? 0} نتيجة، ${r.created ?? 0} جديد، ${r.merged ?? 0} مكرر، ${r.ignored ?? 0} مستبعد`, `${r.results ?? 0} results, ${r.created ?? 0} new, ${r.merged ?? 0} duplicates, ${r.ignored ?? 0} ignored`) : j.type === "ENRICH" && j.status === "DONE" ? (r.merged ? tr("دُمج مع سجل موجود", "Merged into an existing record") : `${pick(VERIFICATION_LABEL, r.verification ?? "", locale)} · ${tr("التقييم", "score")} ${r.score ?? "—"}`) : j.type === "ANALYZE" && j.status === "DONE" ? tr(`${r.opportunities ?? 0} فرصة بدليل`, `${r.opportunities ?? 0} evidenced opportunities`) : "";
    return { what, out };
  };
  return (
    <>
      <AutoRefresh active={running} />
      <PageHeader title={c.name} subtitle={`${c.cities.join("، ") || c.country} · ${tr("الهدف", "target")} ${c.targetCount} · ${tr("الحد الأدنى للتقييم", "min score")} ${c.minScore}`}>
        <Badge tone={running ? "orange" : c.status === "COMPLETED" ? "green" : c.status === "FAILED" ? "red" : "gray"}>{pick(CAMPAIGN_STATUS_LABEL, c.status, locale)}</Badge>
        {(c.status === "DRAFT" || c.status === "COMPLETED" || c.status === "FAILED") && <form action={startCampaignAction}><input type="hidden" name="id" value={c.id} /><button className="btn-primary">{c.status === "DRAFT" ? tr("بدء البحث", "Start search") : tr("تشغيل مرة أخرى", "Run again")}</button></form>}
        {running && <form action={pauseCampaignAction}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost">{tr("إيقاف مؤقت", "Pause")}</button></form>}
        {c.status === "PAUSED" && <form action={resumeCampaignAction}><input type="hidden" name="id" value={c.id} /><button className="btn-primary">{tr("استئناف", "Resume")}</button></form>}
        <form action={duplicateCampaignAction}><input type="hidden" name="id" value={c.id} /><button className="btn-ghost">{tr("نسخ", "Duplicate")}</button></form>
        <form action={deleteCampaignAction}><input type="hidden" name="id" value={c.id} /><ConfirmButton className="btn-danger" message={tr("حذف الحملة؟ العملاء المحفوظون يبقون في قاعدة البيانات.", "Delete this campaign? Saved leads stay in the database.")}>{tr("حذف", "Delete")}</ConfirmButton></form>
      </PageHeader>
      <Flash searchParams={sp} />
      {c.lastError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><b>{tr("آخر خطأ: ", "Last error: ")}</b>{NOTE_LABEL[c.lastError]?.[locale] ?? c.lastError}</div>}
      {notes.map((n) => <div key={n} className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{NOTE_LABEL[n]?.[locale] ?? n}</div>)}

      <div className="card mb-4 p-4">
        <div className="mb-2 flex justify-between text-sm"><span className="font-semibold">{tr("تقدم عمليات البحث", "Search progress")}</span><span className="tabular-nums text-gray-500">{c.queriesDone} / {c.queriesTotal} ({pct}%)</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-phoenix transition-all" style={{ width: `${pct}%` }} /></div>
        <p className="mt-2 text-xs text-gray-500">{tr("الأرقام من سجلات الخادم الفعلية. العدد المطلوب هدف وليس ضماناً.", "Figures come from real server records. The target count is a goal, not a guarantee.")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={tr("مرشحون وُجدوا (هذا التشغيل)", "Candidates found (this run)")} value={c.candidatesFound} />
        <Stat label={tr("عملاء جدد حُفظوا (هذا التشغيل)", "New leads saved (this run)")} value={c.leadsSaved} />
        <Stat label={tr("مكررات دُمجت", "Duplicates merged")} value={c.duplicatesSkipped} />
        <Stat label={tr(`مؤهلون (تقييم ${c.minScore}+)`, `Qualified (score ${c.minScore}+)`)} value={qualified} href={`/leads?campaign=${c.id}&minScore=${c.minScore}`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="h2">{tr("النتائج", "Results")}</h2><Link href={`/leads?campaign=${c.id}`} className="text-sm font-semibold text-phoenix">{tr("عرض الكل", "View all")}</Link></div>
          {leads.length === 0 ? <div className="card p-6 text-center text-sm text-gray-500">{running ? tr("البحث جارٍ. ستظهر النتائج هنا فور حفظها.", "Search in progress. Results appear here as they are saved.") : tr("لا نتائج محفوظة لهذه الحملة.", "No saved results for this campaign.")}</div> : (
            <div className="card divide-y divide-line">{leads.map((l) => (
              <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-offwhite">
                <div className="min-w-0"><div className="truncate text-sm font-semibold">{l.name}</div><div className="text-xs text-gray-500">{l.city || "—"}</div></div>
                <div className="flex shrink-0 items-center gap-2"><Badge tone={verificationTone(l.verification)}>{pick(VERIFICATION_LABEL, l.verification, locale)}</Badge><Badge tone={statusTone(l.status)}>{pick(STATUS_LABEL, l.status, locale)}</Badge><ScoreBadge score={l.score} /></div>
              </Link>
            ))}</div>
          )}
        </section>
        <section>
          <h2 className="h2 mb-3">{tr("سجل المهام", "Job log")}</h2>
          {jobs.length === 0 ? <div className="card p-6 text-center text-sm text-gray-500">{tr("لم تُشغَّل الحملة بعد.", "This campaign has not run yet.")}</div> : (
            <div className="card divide-y divide-line">{jobs.map((j) => { const d = describe(j); return (
              <div key={j.id} className="p-3 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="font-semibold">{pick(JOB_TYPE_LABEL, j.type, locale)}</span><Badge tone={jobTone(j.status)}>{pick(JOB_STATUS_LABEL, j.status, locale)}</Badge></div>
                {d.what && <div className="mt-1 break-words text-xs text-gray-600" dir="auto">{d.what}</div>}
                {d.out && <div className="mt-1 text-xs text-gray-500">{d.out}</div>}
                {j.error && <div className="mt-1 break-words text-xs text-red-700" dir="ltr">{j.error.slice(0, 300)}</div>}
              </div>
            ); })}</div>
          )}
        </section>
      </div>

      <details className="card mt-6 p-4">
        <summary className="cursor-pointer text-sm font-bold">{tr("تعديل إعدادات الحملة", "Edit campaign settings")}</summary>
        <form action={updateCampaignAction} className="mt-4">
          <input type="hidden" name="id" value={c.id} />
          <CampaignFields c={c} tr={tr} locale={locale} defaultServices={org.agencyServices} />
          <div className="mt-4"><button className="btn-primary">{tr("حفظ التعديلات", "Save changes")}</button></div>
        </form>
        <p className="muted mt-2">{c.nextRunAt ? `${tr("التشغيل المجدول التالي", "Next scheduled run")}: ${fmtDate(c.nextRunAt, locale, true)}` : ""}</p>
      </details>
    </>
  );
}
