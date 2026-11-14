import Link from "next/link";
import { db } from "@/lib/db";
import { leadScope, requireUser } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { providerReadiness } from "@/lib/providerStatus";
import { CONFIDENCE_LABEL, pick } from "@/lib/labels";
import { analyzeLeadAction } from "@/actions/leads";
import { Flash } from "@/components/Flash";
import { Badge, ConfigRequired, Empty, PageHeader, Pager, ScoreBadge, Stat } from "@/components/ui";

export const metadata = { title: "التحليل الذكي" };
const PAGE = 20;

export default async function Analysis({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const { tr, locale } = await getTr();
  const scope = leadScope(u);
  const view = sp.view === "pending" ? "pending" : sp.view === "signals" ? "signals" : "all";
  const where = { ...scope, ...(view === "pending" ? { analyses: { none: {} } } : view === "signals" ? { signals: { some: {} } } : {}) };
  const page = Math.max(1, Number(sp.page) || 1);
  const [ready, analysed, withSignals, pending, total, leads] = await Promise.all([
    providerReadiness(u.organizationId),
    db.lead.count({ where: { ...scope, analyses: { some: {} } } }),
    db.lead.count({ where: { ...scope, signals: { some: {} } } }),
    db.lead.count({ where: { ...scope, analyses: { none: {} } } }),
    db.lead.count({ where }),
    db.lead.findMany({ where, orderBy: [{ score: "desc" }], skip: (page - 1) * PAGE, take: PAGE, include: { signals: { orderBy: { createdAt: "desc" }, take: 2 }, analyses: { orderBy: { createdAt: "desc" }, take: 1 } } }),
  ]);
  return (
    <>
      <PageHeader title={tr("التحليل الذكي", "AI Analysis")} subtitle={tr("يحلل الذكاء الاصطناعي المصادر المحفوظة فقط، وكل فرصة يجب أن تقتبس دليلها من مصدر حقيقي.", "The AI analyses only the stored sources, and every opportunity must quote evidence from a real source.")} />
      <Flash searchParams={sp} />
      {!ready.hasAI && <ConfigRequired title={tr("يتطلب إعداداً", "CONFIGURATION REQUIRED")} text={tr("لم يُفعَّل مزود ذكاء اصطناعي. الإشارات المعروضة هنا مستخرجة بالكلمات المفتاحية وتُعلَّم «غير مؤكدة».", "No AI provider is enabled. Signals shown here come from keyword matching and are marked Uncertain.")} href={u.role === "ADMIN" ? "/ai" : undefined} cta={tr("اتصالات الذكاء الاصطناعي", "AI Connections")} />}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label={tr("حُلّلوا بالذكاء الاصطناعي", "Analysed by AI")} value={analysed} href="/analysis" />
        <Stat label={tr("لهم إشارات فرص", "With opportunity signals")} value={withSignals} href="/analysis?view=signals" />
        <Stat label={tr("لم يُحلَّلوا بعد", "Not analysed yet")} value={pending} href="/analysis?view=pending" />
      </div>
      {leads.length === 0 ? <Empty title={tr("لا يوجد عملاء في هذا العرض", "No leads in this view")} /> : (
        <div className="space-y-3">{leads.map((l) => { const a = l.analyses[0]; return (
          <div key={l.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/leads/${l.id}`} className="font-bold hover:text-phoenix">{l.name}</Link>
              <div className="flex items-center gap-2"><ScoreBadge score={l.score} />
                <form action={analyzeLeadAction}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="back" value="/analysis" /><button className="btn-ghost btn-sm" disabled={!ready.hasAI}>{a ? tr("إعادة التحليل", "Re-analyse") : tr("تحليل", "Analyse")}</button></form>
              </div>
            </div>
            {a ? <p className="mt-2 text-sm leading-7 text-gray-700" dir="auto">{a.summary}</p> : <p className="muted mt-2">{tr("لا يوجد تحليل ذكي لهذا العميل.", "No AI analysis for this lead.")}</p>}
            {l.signals.map((s) => (
              <div key={s.id} className="mt-2 flex flex-wrap items-center gap-2 text-sm"><Badge tone={s.uncertain ? "amber" : "green"}>{s.uncertain ? tr("غير مؤكدة", "Uncertain") : pick(CONFIDENCE_LABEL, s.confidence, locale)}</Badge><span className="font-semibold">{s.title}</span>{s.suggestedService && <span className="text-xs text-gray-500">← {s.suggestedService}</span>}</div>
            ))}
          </div>
        ); })}</div>
      )}
      <Pager page={page} pages={Math.ceil(total / PAGE)} makeHref={(p) => `/analysis?view=${view}&page=${p}`} prev={tr("السابق", "Previous")} next={tr("التالي", "Next")} />
    </>
  );
}
