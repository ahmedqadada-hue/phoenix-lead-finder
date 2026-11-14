import type { Campaign } from "@prisma/client";
import { COUNTRIES, INDUSTRIES, findCountry, findIndustry } from "@/lib/discovery/industries";
import { SCHEDULE_LABEL } from "@/lib/labels";
import type { Locale, Tr } from "@/lib/i18n";
import { Field } from "./ui";

export function CampaignFields({ c, tr, locale, defaultServices }: { c?: Campaign | null; tr: Tr; locale: Locale; defaultServices: string[] }) {
  const known = c ? findIndustry(c.industry) : INDUSTRIES[0];
  const country = c ? (findCountry(c.country)?.en ?? c.country) : "Saudi Arabia";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label={tr("اسم الحملة", "Campaign name")}><input name="name" required minLength={2} maxLength={120} defaultValue={c?.name ?? ""} className="input" placeholder={tr("مثال: مطاعم الرياض", "e.g. Riyadh restaurants")} /></Field>
      <Field label={tr("الدولة", "Country")}>
        <select name="country" defaultValue={country} className="input">{COUNTRIES.map((x) => <option key={x.code} value={x.en}>{locale === "ar" ? x.ar : x.en}</option>)}</select>
      </Field>
      <Field label={tr("المدن", "Cities")} hint={tr("افصل بين المدن بفاصلة. اكتبها كما تُكتب محلياً.", "Separate cities with commas.")}>
        <input name="cities" defaultValue={c?.cities.join("، ") ?? ""} className="input" placeholder={tr("الرياض، جدة", "Riyadh, Jeddah")} />
      </Field>
      <Field label={tr("المجال", "Industry")}>
        <select name="industry" defaultValue={c ? (known ? known.key : "__other") : INDUSTRIES[0].key} className="input">
          {INDUSTRIES.map((i) => <option key={i.key} value={i.key}>{locale === "ar" ? i.ar : i.en}</option>)}
          <option value="__other">{tr("مجال آخر (اكتبه في الخانة التالية)", "Other (type it in the next field)")}</option>
        </select>
      </Field>
      <Field label={tr("مجال آخر", "Other industry")} hint={tr("يُستخدم فقط إذا اخترت «مجال آخر». لا يدعمه OpenStreetMap.", "Used only when “Other” is selected. Not supported by OpenStreetMap.")}>
        <input name="industryOther" maxLength={80} defaultValue={c && !known ? c.industry : ""} className="input" />
      </Field>
      <Field label={tr("تصنيف النشاط (اختياري)", "Business category (optional)")}><input name="category" maxLength={80} defaultValue={c?.category ?? ""} className="input" placeholder={tr("مثال: برجر، قهوة مختصة", "e.g. burgers, specialty coffee")} /></Field>
      <Field label={tr("الخدمات المستهدفة", "Target services")} hint={tr("الخدمات التي تريد عرضها على هؤلاء العملاء، مفصولة بفاصلة.", "Services you want to offer these leads, comma-separated.")}>
        <input name="services" defaultValue={(c?.services ?? defaultServices).join("، ")} className="input" placeholder={tr("إدارة حسابات التواصل، إنتاج فيديو", "Social media management, video production")} />
      </Field>
      <Field label={tr("لغة البحث", "Search language")}>
        <select name="language" defaultValue={c?.language ?? "ar"} className="input"><option value="ar">{tr("العربية", "Arabic")}</option><option value="en">{tr("الإنجليزية", "English")}</option><option value="both">{tr("العربية والإنجليزية", "Arabic and English")}</option></select>
      </Field>
      <Field label={tr("عدد المرشحين المطلوب", "Target candidate count")} hint={tr("هدف وليس ضماناً: العدد الفعلي يعتمد على ما تجده المصادر.", "A target, not a guarantee: the real number depends on what the sources return.")}>
        <input name="targetCount" type="number" min={1} max={500} defaultValue={c?.targetCount ?? 50} className="input" />
      </Field>
      <Field label={tr("الحد الأدنى للتقييم", "Minimum lead score")} hint={tr("من يبلغ هذا التقييم يُعلَّم «مؤهل». بدون ذكاء اصطناعي يندر تجاوز 70.", "Leads reaching this score are marked Qualified. Without AI, scores rarely exceed 70.")}>
        <input name="minScore" type="number" min={0} max={100} defaultValue={c?.minScore ?? 40} className="input" />
      </Field>
      <Field label={tr("التكرار", "Schedule")} hint={tr("اليومي والأسبوعي يعملان على الخادم حتى لو كانت أجهزتك مطفأة.", "Daily and weekly runs happen on the server even when your devices are off.")}>
        <select name="schedule" defaultValue={c?.schedule ?? "MANUAL"} className="input">{Object.entries(SCHEDULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v[locale]}</option>)}</select>
      </Field>
    </div>
  );
}
