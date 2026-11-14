import { requireUser, isManager } from "@/lib/auth";
import { getTr } from "@/lib/i18n";
import { ROLE_LABEL, pick } from "@/lib/labels";
import { Nav, type NavItem } from "@/components/Nav";
import { logoutAction, setLocaleAction } from "@/actions/auth";
import { db } from "@/lib/db";
import { JobPump } from "@/components/Client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { tr, locale } = await getTr();
  const mgr = isManager(user), admin = user.role === "ADMIN";
  // On serverless hosting there is no worker process: the open app moves the queue along.
  const serverless = !!process.env.VERCEL || process.env.SERVERLESS_WORKER === "1";
  const due = serverless ? await db.backgroundJob.count({ where: { organizationId: user.organizationId, status: "PENDING", runAt: { lte: new Date() }, OR: [{ campaignId: null }, { campaign: { status: "RUNNING" } }] } }) : 0;
  const work = tr("العمل", "Work"), manage = tr("الإدارة", "Management"), system = tr("النظام", "System");
  const items: NavItem[] = [
    { href: "/", label: tr("لوحة التحكم", "Dashboard"), icon: "home" },
    ...(mgr ? [{ href: "/discover", label: tr("اكتشاف العملاء", "Discover Leads"), icon: "search", group: work }] : []),
    { href: "/leads", label: tr("قاعدة العملاء", "Lead Database"), icon: "users", group: work },
    { href: "/analysis", label: tr("التحليل الذكي", "AI Analysis"), icon: "spark", group: work },
    { href: "/messages", label: tr("استوديو الرسائل", "Message Studio"), icon: "chat", group: work },
    { href: "/outreach", label: tr("مساحة التواصل", "Outreach Workspace"), icon: "send", group: work },
    { href: "/followups", label: tr("المتابعات", "Follow-ups"), icon: "clock", group: work },
    ...(mgr ? [
      { href: "/campaigns", label: tr("الحملات", "Campaigns"), icon: "flag", group: manage },
      { href: "/reports", label: tr("التقارير", "Reports"), icon: "chart", group: manage },
      { href: "/jobs", label: tr("مهام الخلفية", "Background Jobs"), icon: "list", group: manage },
    ] : []),
    { href: "/settings", label: tr("الإعدادات", "Settings"), icon: "cog", group: system },
    ...(admin ? [
      { href: "/ai", label: tr("اتصالات الذكاء الاصطناعي", "AI Connections"), icon: "bolt", group: system },
      { href: "/providers", label: tr("مزودو البحث", "Search Providers"), icon: "globe", group: system },
      { href: "/users", label: tr("المستخدمون والصلاحيات", "Users & Permissions"), icon: "shield", group: system },
    ] : []),
  ];
  return (
    <div className="min-h-screen">
      <Nav items={items} userName={user.name} roleLabel={pick(ROLE_LABEL, user.role, locale)}>
        <div className="flex gap-2">
          <form action={setLocaleAction} className="flex-1">
            <input type="hidden" name="back" value="/" />
            <button name="locale" value={locale === "ar" ? "en" : "ar"} className="w-full rounded-lg bg-slate2 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:text-white">{locale === "ar" ? "English" : "العربية"}</button>
          </form>
          <form action={logoutAction} className="flex-1">
            <button className="w-full rounded-lg bg-slate2 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:text-white">{tr("خروج", "Sign out")}</button>
          </form>
        </div>
      </Nav>
      <main className="lg:ps-64">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</div>
        {due > 0 && <JobPump locale={locale} />}
      </main>
    </div>
  );
}
