import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { SEARCH_PROVIDERS, ensureDefaultConnections } from "@/lib/providers/connections";
import { Flash } from "@/components/Flash";
import { ProviderCard } from "@/components/ProviderCard";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "مزودو البحث" };

export default async function Providers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireRole("ADMIN");
  const { tr, locale } = await getTr();
  await ensureDefaultConnections(u.organizationId);
  const rows = await db.providerConnection.findMany({ where: { organizationId: u.organizationId, kind: "SEARCH" } });
  const NOTE: Record<string, string> = {
    osm: tr("مجاني وبدون مفتاح. يعطي أنشطة حقيقية مسجّلة على الخرائط المفتوحة ولها موقع أو هاتف أو حساب. لا يعرف الأخبار ولا الحسابات غير المسجّلة فيه. البيانات © المساهمون في OpenStreetMap (ODbL).", "Free, no key. Returns real businesses listed on the open map that have a website, phone or account. It knows no news and no accounts that are not listed. Data © OpenStreetMap contributors (ODbL)."),
    tavily: tr("بحث ويب. له باقة مجانية شهرية بلا بطاقة بحسب موقعهم وقت كتابة هذا. تحقق من الشروط الحالية.", "Web search. Had a free monthly plan with no card at the time of writing. Check their current terms."),
    brave: tr("بحث ويب. يمنح رصيداً شهرياً ويطلب بطاقة، ولا يضع سقفاً للصرف من جهته، لذلك أبقِ الحد الشهري هنا أقل من رصيدك المجاني.", "Web search. Gives a monthly credit and requires a card, with no spending cap on their side — keep the monthly limit here below your free credit."),
    serper: tr("نتائج بحث Google عبر Serper. رصيده المجاني لمرة واحدة وليس شهرياً.", "Google results via Serper. Its free credit is one-time, not monthly."),
    youcom: tr("بحث ويب. تكامل تجريبي: لم يُختبر مع الخدمة الحقيقية في هذا الإصدار، استخدم «اختبار الاتصال» للتأكد.", "Web search. Experimental integration: not verified against the live service in this release — use “Test connection” to confirm."),
  };
  return (
    <>
      <PageHeader title={tr("مزودو البحث", "Search Providers")} subtitle={tr("يعمل الاكتشاف بأي مزود جاهز. عند تفعيل أكثر من مزود ويب يوزّع التطبيق الاستعلامات عليها ويتوقف عند الحد الشهري لكل واحد.", "Discovery works with any ready provider. With several web providers enabled the app spreads queries across them and stops at each one's monthly limit.")} />
      <Flash searchParams={sp} />
      <div className="mb-4 rounded-xl border border-line bg-white p-4 text-sm text-gray-700">
        {tr("حالة «يعمل» تظهر فقط بعد نجاح اختبار اتصال حقيقي. أي مزود بلا مفتاح يبقى «يتطلب إعداداً» ولا يُستخدم.", "“Working” appears only after a real connection test succeeds. A provider without a key stays CONFIGURATION REQUIRED and is not used.")}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {SEARCH_PROVIDERS.map((p) => (
          <ProviderCard key={p.id} kind="SEARCH" id={p.id} label={p.label} signupUrl={p.signupUrl} note={NOTE[p.id] ?? ""} requiresKey={p.requiresKey} defaultLimit={p.defaultMonthlyLimit}
            conn={rows.find((r) => r.provider === p.id) ?? null} tr={tr} locale={locale} unitLabel={tr("عملية بحث", "searches")} />
        ))}
      </div>
    </>
  );
}
