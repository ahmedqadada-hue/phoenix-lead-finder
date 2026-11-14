import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { ROLE_LABEL } from "@/lib/labels";
import { createUserAction, updateUserAction } from "@/actions/users";
import { Flash } from "@/components/Flash";
import { Field, PageHeader, fmtDate } from "@/components/ui";

export const metadata = { title: "المستخدمون والصلاحيات" };

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const u = await requireRole("ADMIN");
  const { tr, locale } = await getTr();
  const users = await db.user.findMany({ where: { organizationId: u.organizationId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { assignedLeads: true } } } });
  return (
    <>
      <PageHeader title={tr("المستخدمون والصلاحيات", "Users & Permissions")} />
      <Flash searchParams={sp} />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {[[ROLE_LABEL.ADMIN[locale], tr("يضبط التكاملات والمفاتيح، يدير المستخدمين، يصل لكل العملاء والحملات.", "Configures integrations and keys, manages users, accesses all leads and campaigns.")],
          [ROLE_LABEL.MANAGER[locale], tr("ينشئ الحملات، يسند العملاء، يدير التواصل والتقارير.", "Creates campaigns, assigns leads, manages outreach and reports.")],
          [ROLE_LABEL.EMPLOYEE[locale], tr("يرى العملاء المُسندين إليه فقط، يكتب الرسائل، يفتح قنوات التواصل ويحدّث الحالات.", "Sees only leads assigned to them, drafts messages, opens contact channels and updates statuses.")]].map(([r, d]) => (
          <div key={r} className="card p-4"><div className="text-sm font-bold">{r}</div><p className="mt-1 text-xs text-gray-600">{d}</p></div>
        ))}
      </div>
      <section className="card mb-6 p-5">
        <h2 className="h2">{tr("إضافة مستخدم", "Add a user")}</h2>
        <form action={createUserAction} className="mt-4 grid gap-4 md:grid-cols-4">
          <Field label={tr("الاسم", "Name")}><input name="name" required minLength={2} className="input" /></Field>
          <Field label={tr("البريد الإلكتروني", "E-mail")}><input name="email" type="email" required dir="ltr" autoComplete="off" className="input" /></Field>
          <Field label={tr("الدور", "Role")}><select name="role" defaultValue="EMPLOYEE" className="input">{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v[locale]}</option>)}</select></Field>
          <Field label={tr("كلمة مرور مؤقتة", "Temporary password")} hint={tr("10 أحرف على الأقل. يغيّرها المستخدم من الإعدادات.", "At least 10 characters. The user changes it in Settings.")}><input name="password" type="password" required minLength={10} dir="ltr" autoComplete="new-password" className="input" /></Field>
          <div><button className="btn-primary">{tr("إضافة", "Add")}</button></div>
        </form>
      </section>
      <div className="space-y-3">
        {users.map((x) => (
          <form key={x.id} action={updateUserAction} className="card grid items-end gap-3 p-4 md:grid-cols-6">
            <input type="hidden" name="id" value={x.id} />
            <div className="md:col-span-2"><div className="text-sm font-bold">{x.name} {x.id === u.id && <span className="text-xs font-normal text-gray-500">({tr("أنت", "you")})</span>}</div><div className="text-xs text-gray-500" dir="ltr">{x.email}</div><div className="text-xs text-gray-400">{tr("أُضيف", "Added")} {fmtDate(x.createdAt, locale)} · {x._count.assignedLeads} {tr("عميل مُسند", "assigned leads")}</div></div>
            <label className="block"><span className="label">{tr("الدور", "Role")}</span><select name="role" defaultValue={x.role} className="input">{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v[locale]}</option>)}</select></label>
            <label className="block"><span className="label">{tr("كلمة مرور جديدة (اختياري)", "New password (optional)")}</span><input name="password" type="password" minLength={10} dir="ltr" autoComplete="new-password" className="input" /></label>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={x.active} className="h-4 w-4 accent-phoenix" />{tr("نشط", "Active")}</label>
            <div><button className="btn-ghost btn-sm">{tr("حفظ", "Save")}</button></div>
          </form>
        ))}
      </div>
    </>
  );
}
