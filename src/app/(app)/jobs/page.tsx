import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL, SKIP_LABEL, pick } from "@/lib/labels";
import { AutoRefresh } from "@/components/Client";
import { Badge, Empty, PageHeader, Pager, Stat, fmtDate } from "@/components/ui";

export const metadata = { title: "مهام الخلفية" };
const PAGE = 40;

export default async function Jobs({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireRole("ADMIN", "MANAGER");
  const { tr, locale } = await getTr();
  const status = ["PENDING", "RUNNING", "DONE", "FAILED", "CANCELLED"].includes(sp.status) ? sp.status : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = { organizationId: u.organizationId, ...(status ? { status: status as any } : {}) };
  const [groups, total, jobs, lastDone] = await Promise.all([
    db.backgroundJob.groupBy({ by: ["status"], where: { organizationId: u.organizationId }, _count: true }),
    db.backgroundJob.count({ where }),
    db.backgroundJob.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { campaign: { select: { id: true, name: true } } } }),
    db.backgroundJob.findFirst({ where: { status: { in: ["DONE", "FAILED"] } }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
  ]);
  const count = (s: string) => groups.find((g) => g.status === s)?._count ?? 0;
  const oldestPending = await db.backgroundJob.findFirst({ where: { organizationId: u.organizationId, status: "PENDING", runAt: { lte: new Date(Date.now() - 2 * 60_000) }, OR: [{ campaignId: null }, { campaign: { status: "RUNNING" } }] } });
  const tone = (s: string) => (s === "DONE" ? "green" : s === "FAILED" ? "red" : s === "RUNNING" ? "orange" : "gray");
  return (
    <>
      <AutoRefresh active={count("PENDING") + count("RUNNING") > 0} />
      <PageHeader title={tr("مهام الخلفية", "Background Jobs")} subtitle={tr("تُنفَّذ هذه المهام على الخادم بواسطة العامل الخلفي، سواء كان متصفحك مفتوحاً أم لا.", "These jobs run on the server by the background worker, whether or not your browser is open.")} />
      {oldestPending && !process.env.VERCEL && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{tr("توجد مهام منتظرة منذ أكثر من دقيقتين. تأكد أن العامل الخلفي (worker) يعمل على الخادم.", "Some jobs have been waiting for over two minutes. Check that the background worker is running on the server.")}</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {["PENDING", "RUNNING", "DONE", "FAILED", "CANCELLED"].map((s) => <Stat key={s} label={pick(JOB_STATUS_LABEL, s, locale)} value={count(s)} href={`/jobs?status=${s}`} />)}
      </div>
      <p className="muted my-3">{tr("آخر مهمة أنجزها العامل", "Last job finished by the worker")}: {fmtDate(lastDone?.finishedAt, locale, true)} {status && <Link href="/jobs" className="ms-2 font-semibold text-phoenix">{tr("إزالة الفلتر", "Clear filter")}</Link>}</p>
      {jobs.length === 0 ? <Empty title={tr("لا توجد مهام", "No jobs")} text={tr("تظهر المهام هنا عند تشغيل حملة أو إعادة فحص عميل.", "Jobs appear here when a campaign runs or a lead is re-checked.")} /> : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[760px]">
          <thead className="bg-offwhite"><tr><th className="th">{tr("النوع", "Type")}</th><th className="th">{tr("الحملة", "Campaign")}</th><th className="th">{tr("الحالة", "Status")}</th><th className="th">{tr("المحاولات", "Attempts")}</th><th className="th">{tr("أُنشئت", "Created")}</th><th className="th">{tr("التفاصيل", "Details")}</th></tr></thead>
          <tbody className="divide-y divide-line">{jobs.map((j) => { const p = j.payload as any, r = (j.result ?? {}) as any; return (
            <tr key={j.id}>
              <td className="td font-semibold">{pick(JOB_TYPE_LABEL, j.type, locale)}</td>
              <td className="td">{j.campaign ? <Link className="hover:text-phoenix" href={`/campaigns/${j.campaign.id}`}>{j.campaign.name}</Link> : "—"}</td>
              <td className="td"><Badge tone={tone(j.status)}>{pick(JOB_STATUS_LABEL, j.status, locale)}</Badge></td>
              <td className="td tabular-nums">{j.attempts} / {j.maxAttempts}</td>
              <td className="td whitespace-nowrap">{fmtDate(j.createdAt, locale, true)}</td>
              <td className="td max-w-xs text-xs text-gray-600"><div className="break-words" dir="auto">{p.query ?? (p.provider === "osm" ? `OpenStreetMap · ${p.city}` : "")}</div>{r.skipped && <div>{pick(SKIP_LABEL, r.skipped, locale)}</div>}{j.error && <div className="break-words text-red-700" dir="ltr">{j.error.slice(0, 200)}</div>}</td>
            </tr>
          ); })}</tbody>
        </table></div>
      )}
      <Pager page={page} pages={Math.ceil(total / PAGE)} makeHref={(p) => `/jobs?${status ? `status=${status}&` : ""}page=${p}`} prev={tr("السابق", "Previous")} next={tr("التالي", "Next")} />
    </>
  );
}
