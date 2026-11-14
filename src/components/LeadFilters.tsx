import { COUNTRIES, INDUSTRIES } from "@/lib/discovery/industries";
import { STATUS_LABEL, VERIFICATION_LABEL } from "@/lib/labels";
import type { Locale, Tr } from "@/lib/i18n";

export function LeadFilters({ f, tr, locale, campaigns, users, action, showSort = true }: {
  f: Record<string, string | undefined>; tr: Tr; locale: Locale; campaigns: { id: string; name: string }[]; users: { id: string; name: string }[]; action: string; showSort?: boolean;
}) {
  return (
    <form action={action} className="card mb-4 grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-6">
      <label className="col-span-2 block"><span className="label">{tr("بحث", "Search")}</span><input name="q" defaultValue={f.q ?? ""} className="input" placeholder={tr("الاسم، الموقع، الحساب", "Name, website, handle")} /></label>
      <label className="block"><span className="label">{tr("الدولة", "Country")}</span><select name="country" defaultValue={f.country ?? ""} className="input"><option value="">{tr("الكل", "All")}</option>{COUNTRIES.map((c) => <option key={c.code} value={c.en}>{locale === "ar" ? c.ar : c.en}</option>)}</select></label>
      <label className="block"><span className="label">{tr("المدينة", "City")}</span><input name="city" defaultValue={f.city ?? ""} className="input" /></label>
      <label className="block"><span className="label">{tr("المجال", "Industry")}</span><select name="industry" defaultValue={f.industry ?? ""} className="input"><option value="">{tr("الكل", "All")}</option>{INDUSTRIES.map((i) => <option key={i.key} value={i.key}>{locale === "ar" ? i.ar : i.en}</option>)}</select></label>
      <label className="block"><span className="label">{tr("التقييم من", "Score from")}</span><input name="minScore" type="number" min={0} max={100} defaultValue={f.minScore ?? ""} className="input" /></label>
      <label className="block"><span className="label">{tr("المنصة", "Platform")}</span><select name="platform" defaultValue={f.platform ?? ""} className="input"><option value="">{tr("الكل", "All")}</option>{[["whatsapp", "WhatsApp"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["linkedin", "LinkedIn"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["website", tr("موقع رسمي", "Website")]].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="block"><span className="label">{tr("الحملة", "Campaign")}</span><select name="campaign" defaultValue={f.campaign ?? ""} className="input"><option value="">{tr("الكل", "All")}</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="block"><span className="label">{tr("حالة التواصل", "Outreach status")}</span><select name="status" defaultValue={f.status ?? ""} className="input"><option value="">{tr("الكل", "All")}</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v[locale]}</option>)}</select></label>
      <label className="block"><span className="label">{tr("التوثيق", "Verification")}</span><select name="verification" defaultValue={f.verification ?? ""} className="input"><option value="">{tr("الكل", "All")}</option>{Object.entries(VERIFICATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v[locale]}</option>)}</select></label>
      <label className="block"><span className="label">{tr("اكتُشف من", "Discovered from")}</span><input name="from" type="date" defaultValue={f.from ?? ""} className="input" /></label>
      <label className="block"><span className="label">{tr("إلى", "To")}</span><input name="to" type="date" defaultValue={f.to ?? ""} className="input" /></label>
      {users.length > 0 && <label className="block"><span className="label">{tr("المسؤول", "Assigned to")}</span><select name="assigned" defaultValue={f.assigned ?? ""} className="input"><option value="">{tr("الكل", "All")}</option><option value="none">{tr("غير مُسند", "Unassigned")}</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
      {showSort && <label className="block"><span className="label">{tr("الترتيب", "Sort")}</span><select name="sort" defaultValue={f.sort ?? ""} className="input">
        <option value="">{tr("الأعلى تقييماً", "Highest score")}</option><option value="score_asc">{tr("الأقل تقييماً", "Lowest score")}</option><option value="new">{tr("الأحدث اكتشافاً", "Newest")}</option><option value="old">{tr("الأقدم", "Oldest")}</option><option value="name">{tr("الاسم", "Name")}</option><option value="checked">{tr("آخر فحص", "Last checked")}</option>
      </select></label>}
      <div className="col-span-2 flex items-end gap-2"><button className="btn-dark">{tr("تطبيق", "Apply")}</button><a href={action} className="btn-ghost">{tr("مسح", "Clear")}</a></div>
    </form>
  );
}
