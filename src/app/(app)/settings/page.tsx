import { db } from "@/lib/db";
import { isManager, requireUser } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { DEFAULT_WEIGHTS, type ScoringWeights } from "@/lib/scoring";
import { FACTOR_LABEL } from "@/lib/labels";
import { changePasswordAction } from "@/actions/auth";
import { addDncAction, deleteTemplateAction, removeDncAction, saveAgencyProfileAction, saveTemplateAction, saveWeightsAction } from "@/actions/settings";
import { Flash } from "@/components/Flash";
import { InstallHelp } from "@/components/Client";
import { Field, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "الإعدادات" };

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireUser();
  const { tr, locale } = await getTr();
  const admin = u.role === "ADMIN", mgr = isManager(u);
  const org = await db.organization.findUniqueOrThrow({ where: { id: u.organizationId } });
  const [templates, dnc, logs] = await Promise.all([
    mgr ? db.messageTemplate.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" } }) : [],
    mgr ? db.doNotContact.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" }, take: 100 }) : [],
    admin ? db.auditLog.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" }, take: 30 }) : [],
  ]);
  const w = { ...DEFAULT_WEIGHTS, ...((org.scoringWeights as Partial<ScoringWeights> | null) ?? {}) };
  const names = admin ? Object.fromEntries((await db.user.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } })).map((x) => [x.id, x.name])) : {};
  return (
    <>
      <PageHeader title={tr("الإعدادات", "Settings")} />
      <Flash searchParams={sp} />
      <div className="grid gap-6 xl:grid-cols-2">
        {admin && (
          <section className="card p-5 xl:col-span-2">
            <h2 className="h2">{tr("ملف الوكالة", "Agency profile")}</h2>
            <p className="muted mt-1">{tr("تُستخدم هذه البيانات لتخصيص الرسائل. اكتب فقط ما هو صحيح: الرسائل لا تذكر شيئاً غير موجود هنا.", "Used to personalise messages. Enter only what is true: messages never mention anything not written here.")}</p>
            <form action={saveAgencyProfileAction} className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label={tr("اسم الوكالة", "Agency name")}><input name="agencyName" defaultValue={org.agencyName} maxLength={120} className="input" /></Field>
              <Field label={tr("الموقع الإلكتروني", "Website")}><input name="agencyWebsite" defaultValue={org.agencyWebsite} maxLength={200} dir="ltr" className="input" /></Field>
              <Field label={tr("وصف مختصر", "Short description")} hint={tr("جملة واحدة، مثل: فريق متخصص بالتسويق والإنتاج الإبداعي", "One sentence, e.g. a team specialised in marketing and creative production")}><input name="agencyDescription" defaultValue={org.agencyDescription} maxLength={400} className="input" /></Field>
              <Field label={tr("رابط معرض الأعمال", "Portfolio link")}><input name="agencyPortfolio" defaultValue={org.agencyPortfolio} maxLength={200} dir="ltr" className="input" /></Field>
              <Field label={tr("الخدمات", "Services")} hint={tr("مفصولة بفاصلة", "Comma-separated")}><input name="agencyServices" defaultValue={org.agencyServices.join("، ")} className="input" /></Field>
              <Field label={tr("بيانات التواصل", "Contact details")}><input name="agencyContact" defaultValue={org.agencyContact} maxLength={200} className="input" /></Field>
              <div className="md:col-span-2"><Field label={tr("أسلوب الكتابة المفضّل", "Preferred writing style")} hint={tr("ملاحظات للذكاء الاصطناعي، مثل: مختصر وودود وبدون رموز تعبيرية", "Notes for the AI, e.g. brief, friendly, no emojis")}><textarea name="writingStyle" defaultValue={org.writingStyle} maxLength={500} className="input min-h-[70px]" /></Field></div>
              <div><button className="btn-primary">{tr("حفظ", "Save")}</button></div>
            </form>
          </section>
        )}

        {admin && (
          <section id="scoring" className="card p-5">
            <h2 className="h2">{tr("أوزان التقييم", "Scoring weights")}</h2>
            <p className="muted mt-1">{tr("تُعدَّل تلقائياً ليكون مجموعها 100. تُطبَّق عند الفحص التالي لكل عميل.", "Automatically rescaled to total 100. Applied the next time each lead is checked.")}</p>
            <form action={saveWeightsAction} className="mt-4 space-y-3">
              {(Object.keys(DEFAULT_WEIGHTS) as (keyof ScoringWeights)[]).map((k) => (
                <label key={k} className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{FACTOR_LABEL[k][locale]}</span><input name={k} type="number" min={0} max={100} step="1" defaultValue={Math.round(w[k])} className="input w-24" /></label>
              ))}
              <button className="btn-primary">{tr("حفظ الأوزان", "Save weights")}</button>
            </form>
          </section>
        )}

        <section id="password" className="card p-5">
          <h2 className="h2">{tr("كلمة المرور", "Password")}</h2>
          <form action={changePasswordAction} className="mt-4 space-y-3">
            <Field label={tr("كلمة المرور الحالية", "Current password")}><input name="current" type="password" required autoComplete="current-password" dir="ltr" className="input" /></Field>
            <Field label={tr("كلمة المرور الجديدة", "New password")} hint={tr("10 أحرف على الأقل، حروف وأرقام.", "At least 10 characters, letters and numbers.")}><input name="next" type="password" required minLength={10} autoComplete="new-password" dir="ltr" className="input" /></Field>
            <button className="btn-primary">{tr("تغيير كلمة المرور", "Change password")}</button>
          </form>
        </section>

        {mgr && (
          <section id="templates" className="card p-5">
            <h2 className="h2">{tr("قوالب الرسائل", "Message templates")}</h2>
            <p className="muted mt-1">{tr("تعمل بدون ذكاء اصطناعي. الخانات المتاحة:", "Work without AI. Available placeholders:")} <code dir="ltr" className="text-xs">{"{{company}} {{city}} {{service}} {{signal}} {{agency}}"}</code></p>
            <form action={saveTemplateAction} className="mt-3 space-y-2">
              <input name="name" required maxLength={80} placeholder={tr("اسم القالب", "Template name")} className="input" />
              <textarea name="content" required maxLength={3000} placeholder={tr("أهلاً بفريق {{company}}، معكم {{agency}}…", "Hello {{company}} team, this is {{agency}}…")} className="input min-h-[110px]" dir="auto" />
              <button className="btn-primary btn-sm">{tr("إضافة قالب", "Add template")}</button>
            </form>
            <ul className="mt-3 divide-y divide-line">{templates.map((t) => (
              <li key={t.id} className="py-2"><div className="flex items-center justify-between"><span className="text-sm font-semibold">{t.name}</span><form action={deleteTemplateAction}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-red-600">{tr("حذف", "Delete")}</button></form></div><p className="mt-1 whitespace-pre-wrap text-xs text-gray-600" dir="auto">{t.content}</p></li>
            ))}</ul>
          </section>
        )}

        {mgr && (
          <section id="dnc" className="card p-5">
            <h2 className="h2">{tr("قائمة «لا تتواصل»", "Do Not Contact registry")}</h2>
            <p className="muted mt-1">{tr("الأنشطة هنا لا تُضاف من أي بحث قادم، والتواصل معها معطّل.", "Businesses here are never added by future searches, and outreach to them is disabled.")}</p>
            <form action={addDncAction} className="mt-3 grid gap-2 md:grid-cols-3">
              <input name="value" required minLength={2} placeholder={tr("نطاق موقع، رابط حساب، أو اسم", "Domain, profile link, or name")} className="input md:col-span-2" dir="auto" />
              <input name="reason" maxLength={200} placeholder={tr("السبب (اختياري)", "Reason (optional)")} className="input" />
              <div><button className="btn-dark btn-sm">{tr("إضافة", "Add")}</button></div>
            </form>
            {dnc.length === 0 ? <p className="muted mt-3">{tr("القائمة فارغة.", "The list is empty.")}</p> : (
              <ul className="mt-3 divide-y divide-line">{dnc.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span dir="auto">{d.domain ?? (d.handle ? `@${d.handle}` : d.name)} <span className="text-xs text-gray-500">{d.reason}</span></span>
                  {admin && <form action={removeDncAction}><input type="hidden" name="id" value={d.id} /><button className="text-xs text-red-600">{tr("إزالة", "Remove")}</button></form>}</li>
              ))}</ul>
            )}
          </section>
        )}

        <section className="card p-5">
          <h2 className="h2">{tr("تثبيت التطبيق", "Install the app")}</h2>
          <div className="mt-3"><InstallHelp locale={locale} /></div>
        </section>

        {admin && (
          <section className="card p-5 xl:col-span-2">
            <h2 className="h2">{tr("سجل التدقيق (آخر 30 إجراء)", "Audit log (last 30 actions)")}</h2>
            <div className="mt-3 overflow-x-auto"><table className="w-full">
              <thead className="bg-offwhite"><tr><th className="th">{tr("الوقت", "Time")}</th><th className="th">{tr("المستخدم", "User")}</th><th className="th">{tr("الإجراء", "Action")}</th><th className="th">{tr("الكيان", "Entity")}</th></tr></thead>
              <tbody className="divide-y divide-line">{logs.map((l) => <tr key={l.id}><td className="td whitespace-nowrap text-xs">{fmtDate(l.createdAt, locale, true)}</td><td className="td text-xs">{names[l.userId ?? ""] ?? "—"}</td><td className="td text-xs" dir="ltr">{l.action}</td><td className="td text-xs" dir="ltr">{l.entity}</td></tr>)}</tbody>
            </table></div>
          </section>
        )}
      </div>
    </>
  );
}
