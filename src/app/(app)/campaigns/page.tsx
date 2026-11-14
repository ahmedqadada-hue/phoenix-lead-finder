import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { CAMPAIGN_STATUS_LABEL, SCHEDULE_LABEL, pick } from "@/lib/labels";
import { industryLabel } from "@/lib/discovery/industries";
import { Flash } from "@/components/Flash";
import { AutoRefresh } from "@/components/Client";
import { Badge, Empty, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "الحملات" };
const tone = (s: string) => (s === "RUNNING" ? "orange" : s === "COMPLETED" ? "green" : s === "FAILED" ? "red" : s === "PAUSED" ? "amber" : "gray");

export default async function Campaigns({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireRole("ADMIN", "MANAGER");
  const { tr, locale } = await getTr();
  const list = await db.campaign.findMany({ where: { organizationId: u.organizationId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { leads: true } } } });
  return (
    <>
      <AutoRefresh active={list.some((c) => c.status === "RUNNING")} />
      <PageHeader title={tr("الحملات", "Campaigns")} subtitle={tr("كل حملة هي عملية بحث محفوظة يمكن تشغيلها يدوياً أو جدولتها.", "Each campaign is a saved search that can be run manually or on a schedule.")}>
        <Link href="/discover" className="btn-primary">{tr("حملة جديدة", "New campaign")}</Link>
      </PageHeader>
      <Flash searchParams={sp} />
      {list.length === 0 ? (
        <Empty title={tr("لا توجد حملات بعد", "No campaigns yet")} text={tr("أنشئ أول حملة من صفحة اكتشاف العملاء.", "Create your first campaign from Discover Leads.")}><Link href="/discover" className="btn-primary">{tr("إنشاء حملة", "Create campaign")}</Link></Empty>
      ) : (
        <div className="card overflow-x-auto"><table className="w-full min-w-[720px]">
          <thead className="bg-offwhite"><tr>
            <th className="th">{tr("الحملة", "Campaign")}</th><th className="th">{tr("الحالة", "Status")}</th><th className="th">{tr("التقدم", "Progress")}</th>
            <th className="th">{tr("العملاء المحفوظون", "Saved leads")}</th><th className="th">{tr("التكرار", "Schedule")}</th><th className="th">{tr("آخر تشغيل", "Last run")}</th>
          </tr></thead>
          <tbody className="divide-y divide-line">{list.map((c) => (
            <tr key={c.id} className="hover:bg-offwhite">
              <td className="td"><Link href={`/campaigns/${c.id}`} className="font-semibold hover:text-phoenix">{c.name}</Link><div className="text-xs text-gray-500">{industryLabel(c.industry, locale)} · {c.cities.join("، ") || c.country}</div></td>
              <td className="td"><Badge tone={tone(c.status)}>{pick(CAMPAIGN_STATUS_LABEL, c.status, locale)}</Badge></td>
              <td className="td tabular-nums">{c.queriesTotal ? `${c.queriesDone} / ${c.queriesTotal}` : "—"}</td>
              <td className="td tabular-nums">{c._count.leads} <span className="text-xs text-gray-400">/ {c.targetCount}</span></td>
              <td className="td">{pick(SCHEDULE_LABEL, c.schedule, locale)}</td>
              <td className="td">{fmtDate(c.lastRunAt, locale, true)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
