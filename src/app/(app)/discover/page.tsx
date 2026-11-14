import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { providerReadiness } from "@/lib/providerStatus";
import { createCampaignAction } from "@/actions/campaigns";
import { CampaignFields } from "@/components/CampaignForm";
import { Flash } from "@/components/Flash";
import { Badge, PageHeader } from "@/components/ui";

export const metadata = { title: "اكتشاف العملاء" };

export default async function Discover({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireRole("ADMIN", "MANAGER");
  const { tr, locale } = await getTr();
  const [ready, org] = await Promise.all([providerReadiness(u.organizationId), db.organization.findUniqueOrThrow({ where: { id: u.organizationId } })]);
  return (
    <>
      <PageHeader title={tr("اكتشاف العملاء", "Discover Leads")} subtitle={tr("حدّد من تبحث عنه. يولّد المحرك استعلامات بحث حقيقية وينفذها على الخادم، ثم يتحقق من كل نشاط ويقيّمه.", "Describe who you are looking for. The engine generates real search queries, runs them on the server, then verifies and scores each business.")} />
      <Flash searchParams={sp} />
      <div className="mb-4 card p-4">
        <div className="mb-2 text-sm font-bold">{tr("المصادر التي ستُستخدم الآن", "Sources that will be used now")}</div>
        <div className="flex flex-wrap gap-2">
          {ready.search.map((s) => (
            <Badge key={s.def.id} tone={s.usable ? "green" : "amber"}>{s.def.label}: {s.usable ? tr("جاهز", "Ready") : tr("يتطلب إعداداً", "CONFIGURATION REQUIRED")}</Badge>
          ))}
          <Badge tone="green">{tr("قراءة مواقع الشركات: جاهز", "Business website reader: Ready")}</Badge>
          <Badge tone={ready.hasAI ? "green" : "amber"}>{tr("التحليل الذكي", "AI analysis")}: {ready.hasAI ? tr("جاهز", "Ready") : tr("يتطلب إعداداً", "CONFIGURATION REQUIRED")}</Badge>
        </div>
        {!ready.hasWeb && <p className="mt-2 text-sm text-amber-800">{tr("بدون مزود بحث ويب: يقتصر الاكتشاف على الأنشطة المسجّلة في OpenStreetMap ولها موقع أو هاتف أو حساب. حسابات إنستغرام التي لا يعرفها OpenStreetMap لن تظهر.", "Without a web-search provider, discovery is limited to businesses listed on OpenStreetMap with a website, phone or account. Instagram-only businesses will not appear.")} {u.role === "ADMIN" && <Link href="/providers" className="font-bold underline">{tr("إعداد المزودات", "Configure providers")}</Link>}</p>}
      </div>
      <form action={createCampaignAction} className="card p-5">
        <input type="hidden" name="back" value="/discover" />
        <CampaignFields tr={tr} locale={locale} defaultServices={org.agencyServices} />
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          <button name="start" value="1" className="btn-primary">{tr("حفظ وبدء البحث", "Save and start search")}</button>
          <button name="start" value="0" className="btn-ghost">{tr("حفظ كمسودة", "Save as draft")}</button>
        </div>
      </form>
      <p className="muted mt-3">{tr("بيانات OpenStreetMap © المساهمون في OpenStreetMap، برخصة ODbL.", "OpenStreetMap data © OpenStreetMap contributors, ODbL licence.")}</p>
    </>
  );
}
