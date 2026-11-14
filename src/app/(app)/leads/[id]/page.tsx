import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isManager, leadScope, requireUser } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { CONFIDENCE_LABEL, FACTOR_LABEL, PRIORITY_LABEL, REASON_LABEL, STATUS_LABEL, VERIFICATION_LABEL, VERIFY_NOTE_LABEL, pick } from "@/lib/labels";
import { industryLabel } from "@/lib/discovery/industries";
import { PLATFORM_LABEL, type Platform } from "@/lib/discovery/social";
import { getSearchProvider } from "@/lib/providers/search/registry";
import { safeExternalUrl } from "@/lib/outreach";
import { priorityOf, type ScoreFactor } from "@/lib/scoring";
import { outreachProps } from "@/lib/leadView";
import { addSocialAction, analyzeLeadAction, assignLeadAction, deleteLeadAction, recheckLeadAction, removeSocialAction, setStatusAction, updateLeadAction } from "@/actions/leads";
import { createFollowUpAction } from "@/actions/followups";
import { Flash } from "@/components/Flash";
import { ConfirmButton } from "@/components/Client";
import { LeadOutreach } from "@/components/LeadOutreach";
import { Badge, PageHeader, ScoreBadge, fmtDate, statusTone, verificationTone } from "@/components/ui";

export const metadata = { title: "تفاصيل العميل" };

function Src({ url, tr }: { url: string; tr: (a: string, e: string) => string }) {
  const safe = safeExternalUrl(url);
  if (safe) { let host = safe; try { host = new URL(safe).hostname.replace(/^www\./, ""); } catch { /* keep */ } return <a href={safe} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-phoenix underline" dir="ltr">{tr("المصدر", "source")}: {host}</a>; }
  if (url.startsWith("manual:")) return <span className="text-xs text-gray-500">{tr("المصدر: إدخال يدوي بواسطة", "Source: entered manually by")} {url.slice(7)}</span>;
  if (url.startsWith("csv:")) return <span className="text-xs text-gray-500">{tr("المصدر: ملف CSV", "Source: CSV file")} {url.slice(4)}</span>;
  return <span className="text-xs text-gray-400">{tr("بلا مصدر", "no source")}</span>;
}

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params; const sp = await searchParams;
  const u = await requireUser();
  const { tr, locale } = await getTr();
  const mgr = isManager(u);
  const lead = await db.lead.findFirst({
    where: { id, ...leadScope(u) },
    include: { socials: { orderBy: { platform: "asc" } }, sources: { orderBy: { fetchedAt: "desc" } }, signals: { orderBy: { createdAt: "desc" } }, analyses: { orderBy: { createdAt: "desc" }, take: 1 }, scores: { orderBy: { createdAt: "desc" }, take: 1 }, activities: { orderBy: { createdAt: "desc" }, take: 15, include: { user: { select: { name: true } } } }, campaign: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } }, followUps: { where: { done: false }, orderBy: { dueAt: "asc" } } },
  });
  if (!lead) notFound();
  const [op, users] = await Promise.all([outreachProps(lead.id, u.organizationId), mgr ? db.user.findMany({ where: { organizationId: u.organizationId, active: true }, select: { id: true, name: true } }) : []]);
  const factors = (lead.scores[0]?.factors ?? []) as unknown as ScoreFactor[];
  const analysis = lead.analyses[0];
  const website = safeExternalUrl(lead.website);
  const logo = lead.logoUrl?.startsWith("https://") ? lead.logoUrl : null;
  const notes = lead.verificationNotes.split(",").filter(Boolean);
  const tomorrow = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const row = (label: string, value: React.ReactNode) => <div className="flex justify-between gap-4 py-2 text-sm"><dt className="shrink-0 text-gray-500">{label}</dt><dd className="min-w-0 break-words text-end font-medium">{value}</dd></div>;

  return (
    <>
      <PageHeader title={lead.name} subtitle={[industryLabel(lead.industry, locale), lead.city, lead.country].filter(Boolean).join(" · ")}>
        <Badge tone={verificationTone(lead.verification)}>{pick(VERIFICATION_LABEL, lead.verification, locale)}</Badge>
        <Badge tone={statusTone(lead.status)}>{pick(STATUS_LABEL, lead.status, locale)}</Badge>
        <form action={recheckLeadAction}><input type="hidden" name="id" value={lead.id} /><button className="btn-ghost btn-sm">{tr("إعادة الفحص", "Re-check")}</button></form>
        <form action={analyzeLeadAction}><input type="hidden" name="id" value={lead.id} /><button className="btn-ghost btn-sm">{tr("تحليل ذكي", "AI analysis")}</button></form>
        {mgr && <form action={deleteLeadAction}><input type="hidden" name="id" value={lead.id} /><ConfirmButton className="btn-danger btn-sm" message={tr("حذف هذا العميل نهائياً؟", "Permanently delete this lead?")}>{tr("حذف", "Delete")}</ConfirmButton></form>}
      </PageHeader>
      <Flash searchParams={sp} />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="h2">{tr("تقييم العميل", "Lead score")}</h2><p className="text-xs text-gray-500">{tr("درجة ملاءمة للعمل معه، وليست احتمال إتمام صفقة.", "A business-fit score, not a probability of closing a sale.")}</p></div>
              <div className="text-end"><div className="text-3xl font-bold tabular-nums">{lead.score}<span className="text-base text-gray-400"> / 100</span></div><div className="text-xs font-semibold text-gray-600">{pick(PRIORITY_LABEL, priorityOf(lead.score), locale)}</div></div>
            </div>
            {factors.length === 0 ? <p className="muted mt-3">{tr("لم يُحسب التقييم بعد. ينتظر مهمة التحقق في الخلفية.", "Not scored yet. Waiting for the background verification job.")}</p> : (
              <div className="mt-4 space-y-3">{factors.map((f) => (
                <div key={f.key}>
                  <div className="flex justify-between text-sm"><span className="font-semibold">{pick(FACTOR_LABEL, f.key, locale)}</span><span className="tabular-nums text-gray-600">{f.score} / {f.max}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-phoenix" style={{ width: `${f.max ? Math.min(100, (f.score / f.max) * 100) : 0}%` }} /></div>
                  <ul className="mt-1 text-xs text-gray-500">{f.reasons.map((r) => <li key={r}>• {pick(REASON_LABEL, r, locale)}</li>)}</ul>
                </div>
              ))}</div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="h2">{tr("إشارات الفرص", "Opportunity signals")}</h2>
            {lead.signals.length === 0 ? <p className="muted mt-2">{tr("لا يوجد دليل على فرصة محددة حالياً. لم يُختلق أي شيء.", "No evidence of a specific opportunity at the moment. Nothing has been invented.")}</p> : (
              <div className="mt-3 space-y-3">{lead.signals.map((s) => (
                <div key={s.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold">{s.title}</span><Badge tone={s.confidence === "HIGH" ? "green" : s.confidence === "MEDIUM" ? "amber" : "gray"}>{pick(CONFIDENCE_LABEL, s.confidence, locale)}</Badge>{s.uncertain && <Badge tone="amber">{tr("غير مؤكدة", "Uncertain")}</Badge>}</div>
                  {s.explanation && <p className="mt-1 text-sm text-gray-700">{s.explanation}</p>}
                  {s.evidence && <blockquote className="mt-2 border-s-2 border-phoenix ps-3 text-sm text-gray-600" dir="auto">«{s.evidence}»</blockquote>}
                  <div className="mt-2 flex flex-wrap items-center gap-3"><Src url={s.sourceUrl} tr={tr} />{s.publishedAt && <span className="text-xs text-gray-500">{tr("تاريخ النشر", "Published")}: {fmtDate(s.publishedAt, locale)}</span>}{s.suggestedService && <span className="text-xs text-gray-700">{tr("الخدمة المقترحة", "Suggested service")}: <b>{s.suggestedService}</b></span>}</div>
                </div>
              ))}</div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="h2">{tr("التحليل الذكي", "AI analysis")}</h2>
            {analysis ? (
              <div className="mt-2 space-y-2 text-sm">
                <p className="leading-7" dir="auto">{analysis.summary || "—"}</p>
                {analysis.fitReason && <p className="text-gray-600" dir="auto"><b>{tr("الملاءمة", "Fit")}:</b> {analysis.fitReason}</p>}
                {analysis.suggestedServices.length > 0 && <div className="flex flex-wrap gap-1.5">{analysis.suggestedServices.map((s) => <Badge key={s} tone="orange">{s}</Badge>)}</div>}
                {analysis.insufficientEvidence && <p className="rounded-lg bg-amber-50 p-2 text-amber-900">{tr("الأدلة المتاحة غير كافية لتأكيد فرصة محددة.", "The available evidence is not enough to confirm a specific opportunity.")}</p>}
                <p className="text-xs text-gray-400" dir="ltr">{analysis.provider} · {analysis.model} · {fmtDate(analysis.createdAt, locale, true)}</p>
              </div>
            ) : <p className="muted mt-2">{op?.hasAI ? tr("لم يُحلَّل بعد. اضغط «تحليل ذكي».", "Not analysed yet. Press “AI analysis”.") : tr("يتطلب إعداداً: لم يُفعَّل مزود ذكاء اصطناعي. التقييم الحالي بالقواعد فقط.", "CONFIGURATION REQUIRED: no AI provider is enabled. The current score is rule-based only.")}</p>}
          </section>

          {op && <LeadOutreach {...op} locale={locale} />}

          <section className="card p-4">
            <h2 className="h2">{tr("المصادر", "Sources")}</h2>
            <ul className="mt-2 divide-y divide-line">{lead.sources.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Badge>{getSearchProvider(s.provider)?.label ?? (s.provider === "manual" ? tr("يدوي", "Manual") : s.provider === "csv" ? "CSV" : s.provider)}</Badge><span className="font-medium" dir="auto">{s.title || "—"}</span><span className="text-xs text-gray-400">{fmtDate(s.fetchedAt, locale)}</span></div>
                {s.snippet && <p className="mt-1 text-xs text-gray-600" dir="auto">{s.snippet}</p>}
                {s.url && <Src url={s.url} tr={tr} />}
              </li>
            ))}</ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-4">
            <div className="flex items-center gap-3">
              {logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt="" width={44} height={44} referrerPolicy="no-referrer" loading="lazy" className="h-11 w-11 rounded-lg border border-line object-cover" />}
              <h2 className="h2">{tr("بيانات النشاط", "Business details")}</h2>
            </div>
            <dl className="mt-2 divide-y divide-line">
              {row(tr("الموقع الرسمي", "Official website"), website ? <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="text-phoenix underline" dir="ltr">{lead.domain ?? website}</a> : "—")}
              {row("WhatsApp", lead.whatsapp ? <span><span dir="ltr">+{lead.whatsapp}</span><br /><Src url={lead.whatsappSource ?? ""} tr={tr} /></span> : "—")}
              {row(tr("الهاتف", "Phone"), lead.phone ? <span dir="ltr">+{lead.phone}</span> : "—")}
              {row(tr("ثقة التوثيق", "Verification confidence"), pick(VERIFICATION_LABEL, lead.verification, locale))}
              {row(tr("الحملة", "Campaign"), lead.campaign ? (mgr ? <Link className="text-phoenix" href={`/campaigns/${lead.campaign.id}`}>{lead.campaign.name}</Link> : lead.campaign.name) : "—")}
              {row(tr("تاريخ الاكتشاف", "Date discovered"), fmtDate(lead.discoveredAt, locale))}
              {row(tr("آخر فحص", "Last checked"), fmtDate(lead.lastCheckedAt, locale, true))}
              {row(tr("المسؤول", "Assigned to"), lead.assignedTo?.name ?? "—")}
            </dl>
            {notes.length > 0 && <ul className="mt-2 rounded-lg bg-offwhite p-3 text-xs text-gray-600">{notes.map((n) => <li key={n}>• {VERIFY_NOTE_LABEL[n]?.[locale] ?? n}</li>)}</ul>}
            {lead.description && <p className="mt-3 text-sm text-gray-600" dir="auto">{lead.description}</p>}
          </section>

          <section className="card p-4">
            <h2 className="h2">{tr("حسابات التواصل", "Social accounts")}</h2>
            {lead.socials.length === 0 ? <p className="muted mt-2">{tr("لم يُعثر على حسابات لها مصدر.", "No sourced accounts found.")}</p> : (
              <ul className="mt-2 divide-y divide-line">{lead.socials.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-2 py-2">
                  <div className="min-w-0"><div className="text-sm font-semibold">{PLATFORM_LABEL[s.platform as Platform] ?? s.platform} <Badge tone={s.verified ? "green" : "gray"}>{s.verified ? tr("من الموقع الرسمي", "From official site") : tr("غير مؤكد", "Unconfirmed")}</Badge></div>
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-xs text-phoenix underline" dir="ltr">{s.url}</a><Src url={s.sourceUrl} tr={tr} /></div>
                  <form action={removeSocialAction}><input type="hidden" name="id" value={lead.id} /><input type="hidden" name="socialId" value={s.id} /><button className="text-xs text-gray-400 hover:text-red-600" aria-label={tr("إزالة", "Remove")}>✕</button></form>
                </li>
              ))}</ul>
            )}
            <form action={addSocialAction} className="mt-3 flex gap-2"><input type="hidden" name="id" value={lead.id} /><input name="url" required dir="ltr" placeholder="https://instagram.com/..." className="input" /><button className="btn-ghost btn-sm">{tr("إضافة", "Add")}</button></form>
          </section>

          <section className="card p-4">
            <h2 className="h2">{tr("حالة التواصل", "Outreach status")}</h2>
            <form action={setStatusAction} className="mt-2 flex gap-2"><input type="hidden" name="id" value={lead.id} />
              <select name="status" defaultValue={lead.status} className="input">{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v[locale]}</option>)}</select>
              <button className="btn-dark btn-sm">{tr("تحديث", "Update")}</button></form>
            {mgr && <form action={assignLeadAction} className="mt-3 flex gap-2"><input type="hidden" name="id" value={lead.id} />
              <select name="assignedToId" defaultValue={lead.assignedTo?.id ?? ""} className="input"><option value="">{tr("بدون مسؤول", "Unassigned")}</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <button className="btn-ghost btn-sm">{tr("إسناد", "Assign")}</button></form>}
          </section>

          <section className="card p-4">
            <h2 className="h2">{tr("متابعة", "Follow-up")}</h2>
            {lead.followUps.map((f) => <div key={f.id} className="mt-2 rounded-lg bg-offwhite p-2 text-xs">{fmtDate(f.dueAt, locale)} — {f.note || tr("بدون ملاحظة", "no note")}</div>)}
            <form action={createFollowUpAction} className="mt-2 space-y-2"><input type="hidden" name="leadId" value={lead.id} /><input type="hidden" name="back" value={`/leads/${lead.id}`} />
              <input type="date" name="dueAt" required defaultValue={tomorrow} className="input" /><input name="note" maxLength={500} placeholder={tr("ملاحظة المتابعة", "Follow-up note")} className="input" />
              <button className="btn-ghost btn-sm">{tr("إضافة متابعة", "Add follow-up")}</button></form>
          </section>

          <details className="card p-4" open={!!sp.error}>
            <summary className="cursor-pointer text-sm font-bold">{tr("تعديل البيانات والملاحظات", "Edit details & notes")}</summary>
            <form action={updateLeadAction} className="mt-3 space-y-2"><input type="hidden" name="id" value={lead.id} />
              <input name="name" required defaultValue={lead.name} className="input" aria-label={tr("الاسم", "Name")} />
              <div className="grid grid-cols-2 gap-2"><input name="city" defaultValue={lead.city} placeholder={tr("المدينة", "City")} className="input" /><input name="country" defaultValue={lead.country} placeholder={tr("الدولة", "Country")} className="input" /></div>
              <input name="industry" defaultValue={lead.industry} placeholder={tr("المجال", "Industry")} className="input" />
              <input name="website" defaultValue={lead.website ?? ""} placeholder={tr("الموقع الرسمي", "Official website")} dir="ltr" className="input" />
              <div className="grid grid-cols-2 gap-2"><input name="whatsapp" defaultValue={lead.whatsapp ? `+${lead.whatsapp}` : ""} placeholder="WhatsApp +966…" dir="ltr" className="input" /><input name="phone" defaultValue={lead.phone ? `+${lead.phone}` : ""} placeholder={tr("الهاتف", "Phone")} dir="ltr" className="input" /></div>
              <textarea name="description" defaultValue={lead.description} placeholder={tr("وصف النشاط", "Description")} className="input min-h-[60px]" />
              <textarea name="notes" defaultValue={lead.notes} placeholder={tr("ملاحظات داخلية", "Internal notes")} className="input min-h-[90px]" />
              <button className="btn-primary btn-sm">{tr("حفظ", "Save")}</button></form>
          </details>
          {lead.notes && <section className="card p-4"><h2 className="h2">{tr("ملاحظات", "Notes")}</h2><p className="mt-2 whitespace-pre-wrap text-sm" dir="auto">{lead.notes}</p></section>}

          <section className="card p-4">
            <h2 className="h2">{tr("سجل النشاط", "Activity log")}</h2>
            {lead.activities.length === 0 ? <p className="muted mt-2">{tr("لا نشاط بعد.", "No activity yet.")}</p> : (
              <ul className="mt-2 space-y-2 text-xs text-gray-600">{lead.activities.map((a) => (
                <li key={a.id}><b>{a.type === "CONTACT_OPENED" ? tr("فُتحت جهة الاتصال", "Contact opened") : a.type === "MARKED_SENT" ? tr("تأكيد الإرسال يدوياً", "Marked as sent") : tr("تغيير الحالة", "Status change")}</b>{a.platform && ` · ${PLATFORM_LABEL[a.platform as Platform] ?? a.platform}`} · {a.user?.name ?? "—"} · {fmtDate(a.createdAt, locale, true)}</li>
              ))}</ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
