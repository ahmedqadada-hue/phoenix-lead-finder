"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateMessageAction, saveMessageAction } from "@/actions/messages";
import { markSentAction, recordContactOpenedAction } from "@/actions/outreach";
import { copyText } from "@/lib/clipboard";
import { buildWhatsAppLink, safeContactUrl } from "@/lib/outreach";
import { LENGTH_LABEL, STYLE_LABEL } from "@/lib/labels";
import { MESSAGE_LENGTHS, MESSAGE_STYLES, type MessageLength, type MessageStyle } from "@/lib/messages";
import { PLATFORM_LABEL, type Platform } from "@/lib/discovery/social";

export interface OutreachLead {
  id: string; name: string; country: string; status: string;
  whatsapp: string | null; whatsappSource: string | null;
  socials: { platform: string; url: string; handle: string; verified: boolean; sourceUrl: string }[];
}

const ERR: Record<string, [string, string]> = {
  AI_NOT_CONFIGURED: ["يتطلب إعداداً: لم يُفعَّل مزود ذكاء اصطناعي. استخدم «قالب جاهز» أو أضف مفتاحاً من صفحة اتصالات الذكاء الاصطناعي.", "CONFIGURATION REQUIRED: no AI provider enabled. Use “Built-in template”, or add a key in AI Connections."],
  AI_LIMIT_REACHED: ["بلغ الذكاء الاصطناعي حده الشهري الذي حددته.", "The AI monthly limit you set has been reached."],
  AI_ERROR: ["تعذر الاتصال بمزود الذكاء الاصطناعي.", "The AI provider could not be reached."],
  AI_EMPTY: ["أعاد النموذج رداً فارغاً. أعد المحاولة.", "The model returned an empty reply. Try again."],
  RATE_LIMIT: ["طلبات كثيرة. انتظر قليلاً.", "Too many requests. Please wait."],
  DNC_BLOCKED: ["هذا النشاط في قائمة «لا تتواصل».", "This business is on the Do Not Contact list."],
  FORBIDDEN: ["ليست لديك صلاحية.", "You do not have permission."],
  INVALID_INPUT: ["بيانات غير صالحة.", "Invalid input."],
};
const ISSUE: Record<string, [string, string]> = {
  MISSING_COMPANY: ["الرسالة لا تذكر اسم الشركة.", "The message does not mention the company name."],
  TOO_SHORT: ["الرسالة أقصر من الطول المختار.", "Shorter than the selected length."],
  TOO_LONG: ["الرسالة أطول من الطول المختار.", "Longer than the selected length."],
  PLACEHOLDER: ["توجد خانة فارغة لم تُملأ، مثل [الاسم].", "Contains an unfilled placeholder such as [name]."],
  UNKNOWN_LINK: ["تحتوي رابطاً ليس من بيانات وكالتك:", "Contains a link that is not in your agency profile:"],
  UNKNOWN_PHONE: ["تحتوي رقماً ليس من بيانات وكالتك:", "Contains a number that is not in your agency profile:"],
};

export function LeadOutreach({ lead, locale, initialMessage, hasAI, templates, defaultService }: {
  lead: OutreachLead; locale: "ar" | "en"; initialMessage: string; hasAI: boolean; templates: { id: string; name: string }[]; defaultService: string;
}) {
  const tr = (ar: string, en: string) => (locale === "ar" ? ar : en);
  const router = useRouter();
  const [text, setText] = useState(initialMessage);
  const [style, setStyle] = useState<MessageStyle>(locale === "ar" ? "ar-sa" : "en");
  const [length, setLength] = useState<MessageLength>("medium");
  const [mode, setMode] = useState<string>(hasAI ? "ai" : "template");
  const [service, setService] = useState(defaultService);
  const [source, setSource] = useState<"AI" | "TEMPLATE" | "MANUAL">("MANUAL");
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "warn"; text: string } | null>(null);
  const [issues, setIssues] = useState<{ code: string; detail?: string }[]>([]);
  const [manualCopy, setManualCopy] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  const [status, setStatus] = useState(lead.status);
  const [pending, start] = useTransition();
  const dnc = status === "DO_NOT_CONTACT";

  const generate = () => start(async () => {
    setNotice(null); setIssues([]);
    const isCustom = mode.startsWith("t:");
    const r = await generateMessageAction({ leadId: lead.id, style, length, mode: isCustom ? "custom" : (mode as "ai" | "template"), templateId: isCustom ? mode.slice(2) : undefined, service });
    if (!r.ok) { const e = ERR[r.error ?? ""]; setNotice({ tone: "err", text: (e ? tr(e[0], e[1]) : r.error ?? "") + (r.detail ? ` — ${r.detail}` : "") }); return; }
    setText(r.content ?? ""); setSource(r.source ?? "TEMPLATE"); setIssues(r.issues ?? []);
  });

  const copy = async () => {
    const ok = await copyText(text);
    setManualCopy(!ok);
    setNotice(ok ? { tone: "ok", text: tr("نُسخت الرسالة.", "Message copied.") } : { tone: "warn", text: tr("تعذر النسخ تلقائياً. حدّد النص وانسخه يدوياً.", "Automatic copy was blocked. Select the text and copy it manually.") });
    return ok;
  };

  const save = () => start(async () => {
    const r = await saveMessageAction({ leadId: lead.id, content: text, style, length, source });
    setNotice(r.ok ? { tone: "ok", text: tr("حُفظت الرسالة.", "Message saved.") } : { tone: "err", text: tr("تعذر الحفظ.", "Could not save.") });
    if (r.ok) { if (status === "NEW" || status === "QUALIFIED") setStatus("MESSAGE_READY"); router.refresh(); }
  });

  // Opening a destination is recorded as "contact opened", never as "sent".
  const onOpen = (platform: string, needsCopy: boolean) => {
    if (needsCopy && text.trim()) void copy();
    setOpened(platform);
    void recordContactOpenedAction(lead.id, platform).then((r) => { if (r.ok && r.status) setStatus(r.status); });
  };

  const markSent = () => start(async () => {
    const r = await markSentAction(lead.id, opened ?? "");
    if (r.ok) { setStatus("SENT_MANUALLY"); setNotice({ tone: "ok", text: tr("سُجّلت كمرسلة يدوياً.", "Recorded as sent manually.") }); router.refresh(); }
    else setNotice({ tone: "err", text: tr("تعذر التسجيل.", "Could not record.") });
  });

  const waLink = useMemo(() => buildWhatsAppLink(lead.whatsapp, text, lead.country), [lead.whatsapp, lead.country, text]);
  const channels = lead.socials.map((s) => ({ ...s, safe: safeContactUrl(s.platform, s.url) })).filter((s) => s.safe);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="h2">{tr("الرسالة", "Message")}</h3>
          <span className="text-xs text-gray-500">{text.length} {tr("حرف", "chars")}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <label className="block"><span className="label">{tr("طريقة الكتابة", "Drafting method")}</span>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="ai">{tr("ذكاء اصطناعي", "AI")}{hasAI ? "" : tr(" (يتطلب إعداداً)", " (configuration required)")}</option>
              <option value="template">{tr("قالب جاهز", "Built-in template")}</option>
              {templates.map((t) => <option key={t.id} value={`t:${t.id}`}>{tr("قالبي: ", "My template: ")}{t.name}</option>)}
            </select></label>
          <label className="block"><span className="label">{tr("اللغة والأسلوب", "Language & tone")}</span>
            <select className="input" value={style} onChange={(e) => setStyle(e.target.value as MessageStyle)}>{MESSAGE_STYLES.map((s) => <option key={s} value={s}>{STYLE_LABEL[s][locale]}</option>)}</select></label>
          <label className="block"><span className="label">{tr("الطول", "Length")}</span>
            <select className="input" value={length} onChange={(e) => setLength(e.target.value as MessageLength)}>{MESSAGE_LENGTHS.map((s) => <option key={s} value={s}>{LENGTH_LABEL[s][locale]}</option>)}</select></label>
          <label className="block"><span className="label">{tr("الخدمة المقترحة", "Service to propose")}</span>
            <input className="input" value={service} onChange={(e) => setService(e.target.value)} maxLength={120} /></label>
        </div>
        <textarea aria-label={tr("نص الرسالة", "Message text")} className="input mt-3 min-h-[180px] leading-7" dir="auto" value={text}
          onChange={(e) => { setText(e.target.value); setSource("MANUAL"); setIssues([]); }} onFocus={(e) => manualCopy && e.currentTarget.select()}
          placeholder={tr("اضغط «إنشاء» لكتابة مسودة، أو اكتب رسالتك هنا.", "Press “Generate” to draft a message, or write your own here.")} />
        {issues.length > 0 && (
          <ul className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            {issues.map((i, k) => <li key={k}>• {ISSUE[i.code] ? tr(ISSUE[i.code][0], ISSUE[i.code][1]) : i.code} {i.detail ?? ""}</li>)}
          </ul>
        )}
        {notice && <div role="status" className={`mt-2 rounded-lg p-3 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-800" : notice.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-800"}`}>{notice.text}</div>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={generate} disabled={pending || dnc}>{text ? tr("إعادة الإنشاء", "Regenerate") : tr("إنشاء", "Generate")}</button>
          <button type="button" className="btn-ghost" onClick={() => void copy()} disabled={!text.trim()}>{tr("نسخ", "Copy")}</button>
          <button type="button" className="btn-ghost" onClick={save} disabled={pending || !text.trim()}>{tr("حفظ", "Save")}</button>
        </div>
      </div>

      <div className="card p-4">
        <h3 className="h2">{tr("قنوات التواصل المتاحة", "Available contact channels")}</h3>
        <p className="muted mt-1">{tr("التطبيق لا يرسل أي رسالة. يفتح لك الوجهة فقط، وأنت تضغط «إرسال» بنفسك.", "The app never sends anything. It only opens the destination; you press Send yourself.")}</p>
        {dnc ? (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{tr("هذا النشاط في قائمة «لا تتواصل». التواصل معطّل.", "This business is on the Do Not Contact list. Outreach is disabled.")}</div>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer" onClick={() => onOpen("whatsapp", false)} className="flex items-center justify-between rounded-lg border border-line p-3 hover:border-phoenix">
                <span><span className="block text-sm font-bold">WhatsApp</span><span className="block text-xs text-gray-500" dir="ltr">+{lead.whatsapp}</span></span>
                <span className="text-xs font-semibold text-phoenix">{tr("فتح المحادثة والرسالة معبأة", "Open chat with message prefilled")}</span>
              </a>
            )}
            {channels.map((s) => (
              <a key={`${s.platform}:${s.handle}`} href={s.safe!} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(s.platform, true)} className="flex items-center justify-between rounded-lg border border-line p-3 hover:border-phoenix">
                <span><span className="block text-sm font-bold">{PLATFORM_LABEL[s.platform as Platform] ?? s.platform}{" "}
                  <span className={`badge ${s.verified ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{s.verified ? tr("موثّق", "Verified") : tr("غير موثّق", "Unverified")}</span></span>
                  <span className="block text-xs text-gray-500" dir="ltr">@{s.handle}</span></span>
                <span className="text-xs font-semibold text-phoenix">{tr("نسخ الرسالة وفتح الصفحة", "Copy message & open page")}</span>
              </a>
            ))}
            {!waLink && channels.length === 0 && <div className="rounded-lg bg-offwhite p-3 text-sm text-gray-600 sm:col-span-2">{tr("لا توجد قناة تواصل لها مصدر لهذا النشاط بعد.", "No sourced contact channel is known for this business yet.")}</div>}
          </div>
        )}
        {!dnc && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button type="button" className="btn-dark" onClick={markSent} disabled={pending || status === "SENT_MANUALLY"}>{status === "SENT_MANUALLY" ? tr("مسجّلة كمرسلة", "Recorded as sent") : tr("تم الإرسال (تأكيد يدوي)", "Mark as sent")}</button>
            <span className="text-xs text-gray-500">{opened ? tr("فتحت الوجهة. اضغط هذا الزر فقط بعد أن ترسل الرسالة فعلاً.", "Destination opened. Press this only after you have actually sent the message.") : tr("فتح الرابط لا يُحسب إرسالاً.", "Opening a link is not counted as sending.")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
