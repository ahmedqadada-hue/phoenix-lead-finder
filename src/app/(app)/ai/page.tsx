import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { AI_PROVIDERS } from "@/lib/providers/connections";
import { Flash } from "@/components/Flash";
import { ProviderCard } from "@/components/ProviderCard";
import { Badge, PageHeader } from "@/components/ui";

export const metadata = { title: "اتصالات الذكاء الاصطناعي" };

export default async function AIConnections({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireRole("ADMIN");
  const { tr, locale } = await getTr();
  const rows = await db.providerConnection.findMany({ where: { organizationId: u.organizationId, kind: "AI" } });
  const models = sp.models ? sp.models.split(",").filter((m) => /^[\w.:\-/]{1,80}$/.test(m)) : [];
  const NOTE: Record<string, string> = {
    openai: tr("الطريقة الأساسية. استخدم مفتاحاً من حساب OpenAI API مستقل عن حساب ChatGPT الشخصي. اشتراك ChatGPT لا يغطي فواتير الـ API.", "The primary method. Use a key from an OpenAI API account separate from your personal ChatGPT account. A ChatGPT subscription does not cover API billing."),
    gemini: tr("بديل له حصة مجانية بحسب Google وقت كتابة هذا. تحقق من الحدود الحالية.", "An alternative that had a free allowance from Google at the time of writing. Check current limits."),
    groq: tr("بديل سريع له حصة مجانية وقت كتابة هذا. جودة العربية تختلف بحسب النموذج.", "A fast alternative with a free allowance at the time of writing. Arabic quality varies by model."),
  };
  return (
    <>
      <PageHeader title={tr("اتصالات الذكاء الاصطناعي", "AI Connections")} subtitle={tr("يُستخدم الذكاء الاصطناعي لتحليل الأنشطة واكتشاف الفرص وكتابة الرسائل. عند تفعيل أكثر من مزود يُستخدم صاحب أكبر حصة متبقية.", "AI is used to analyse businesses, detect opportunities and draft messages. With several providers enabled, the one with the most allowance left is used.")} />
      <Flash searchParams={sp} />
      <div className="grid gap-6 xl:grid-cols-2">
        {AI_PROVIDERS.map((p) => (
          <ProviderCard key={p.id} kind="AI" id={p.id} label={p.label} signupUrl={p.signupUrl} note={NOTE[p.id] ?? ""} requiresKey defaultLimit={p.defaultMonthlyLimit} defaultModel={p.defaultModel}
            conn={rows.find((r) => r.provider === p.id) ?? null} tr={tr} locale={locale} unitLabel={tr("مهمة", "tasks")} models={sp.for === p.id ? models : undefined} />
        ))}
        <section className="card p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="h2">Sign in with ChatGPT</h2><Badge tone="gray">{tr("غير متاح", "Unavailable")}</Badge></div>
          <p className="muted mt-2">{tr("لم يُفعَّل هذا الخيار. تسجيل الدخول بحساب ChatGPT مخصص لهوية المستخدم داخل التطبيق، وليس لتشغيل مهام خلفية غير مراقَبة على الخادم برصيد اشتراك ChatGPT. لذلك يعتمد التطبيق على مفاتيح API أعلاه. لا يستخدم التطبيق كوكيز أو جلسات أو كلمات مرور ChatGPT إطلاقاً.", "This option is not enabled. Sign in with ChatGPT is meant for identifying a user inside an app, not for running unattended server-side background jobs on a ChatGPT subscription. The app therefore relies on the API keys above. It never uses ChatGPT cookies, sessions or passwords.")}</p>
          <p className="mt-2 text-xs"><a className="text-phoenix underline" dir="ltr" href="https://developers.openai.com/siwc/quickstart" target="_blank" rel="noopener noreferrer">developers.openai.com/siwc/quickstart</a></p>
        </section>
      </div>
    </>
  );
}
