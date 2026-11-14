import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { loginAction, setLocaleAction } from "@/actions/auth";
import { PhoenixMark } from "@/components/Logo";
import { Flash } from "@/components/Flash";

export const dynamic = "force-dynamic";
export const metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/");
  if ((await db.user.count()) === 0) redirect("/setup");
  const { tr, locale } = await getTr();
  return (
    <main className="min-h-screen grid place-items-center bg-charcoal p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-offwhite">
          <PhoenixMark size={64} />
          <div className="text-center">
            <div className="text-xl font-bold">Phoenix Lead Finder</div>
            <div className="text-sm text-gray-400">{tr("اكتشاف العملاء المحتملين والتواصل اليدوي", "Lead discovery and manual outreach")}</div>
          </div>
        </div>
        <div className="card p-6">
          <Flash searchParams={sp} />
          <form action={loginAction} className="space-y-4">
            <div><label className="label" htmlFor="email">{tr("البريد الإلكتروني", "E-mail")}</label><input id="email" name="email" type="email" required autoComplete="username" dir="ltr" className="input" /></div>
            <div><label className="label" htmlFor="password">{tr("كلمة المرور", "Password")}</label><input id="password" name="password" type="password" required autoComplete="current-password" dir="ltr" className="input" /></div>
            <button className="btn-primary w-full">{tr("تسجيل الدخول", "Sign in")}</button>
          </form>
        </div>
        <form action={setLocaleAction} className="mt-4 text-center">
          <input type="hidden" name="back" value="/login" />
          <button name="locale" value={locale === "ar" ? "en" : "ar"} className="text-sm text-gray-400 hover:text-white">{locale === "ar" ? "English" : "العربية"}</button>
        </form>
      </div>
    </main>
  );
}
