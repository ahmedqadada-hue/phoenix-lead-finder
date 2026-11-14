import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getTr } from "@/lib/i18n";
import { setupAction } from "@/actions/auth";
import { PhoenixMark } from "@/components/Logo";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإعداد الأول" };

export default async function SetupPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  if ((await db.user.count()) > 0) redirect("/login");
  const { tr } = await getTr();
  return (
    <main className="min-h-screen grid place-items-center bg-charcoal p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-offwhite">
          <PhoenixMark size={64} />
          <div className="text-center">
            <div className="text-xl font-bold">{tr("إعداد Phoenix Lead Finder", "Set up Phoenix Lead Finder")}</div>
            <div className="text-sm text-gray-400">{tr("أنشئ حساب مدير النظام الأول. تظهر هذه الصفحة مرة واحدة فقط.", "Create the first administrator. This page appears only once.")}</div>
          </div>
        </div>
        <div className="card p-6">
          <Flash searchParams={sp} />
          <form action={setupAction} className="space-y-4">
            <div><label className="label" htmlFor="organization">{tr("اسم الوكالة أو الشركة", "Agency / company name")}</label><input id="organization" name="organization" required minLength={2} className="input" /></div>
            <div><label className="label" htmlFor="name">{tr("اسمك", "Your name")}</label><input id="name" name="name" required minLength={2} className="input" /></div>
            <div><label className="label" htmlFor="email">{tr("البريد الإلكتروني", "E-mail")}</label><input id="email" name="email" type="email" required dir="ltr" autoComplete="username" className="input" /></div>
            <div>
              <label className="label" htmlFor="password">{tr("كلمة المرور", "Password")}</label>
              <input id="password" name="password" type="password" required minLength={10} dir="ltr" autoComplete="new-password" className="input" />
              <p className="mt-1 text-xs text-gray-500">{tr("10 أحرف على الأقل، تحتوي حروفاً وأرقاماً.", "At least 10 characters, with letters and numbers.")}</p>
            </div>
            <button className="btn-primary w-full">{tr("إنشاء الحساب والدخول", "Create account and sign in")}</button>
          </form>
        </div>
      </div>
    </main>
  );
}
