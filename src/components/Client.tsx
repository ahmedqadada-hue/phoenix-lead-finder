"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads server data on an interval so progress shown on screen is always the real database state. */
export function AutoRefresh({ seconds = 5, active = true }: { seconds?: number; active?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [seconds, active, router]);
  return null;
}

export function ConfirmButton({ message, className, children, name, value }: { message: string; className?: string; children: React.ReactNode; name?: string; value?: string }) {
  return <button type="submit" name={name} value={value} className={className} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>{children}</button>;
}

export function InstallHelp({ locale }: { locale: "ar" | "en" }) {
  const tr = (ar: string, en: string) => (locale === "ar" ? ar : en);
  return (
    <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
      <li>{tr("أندرويد (Chrome): القائمة ⋮ ثم «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».", "Android (Chrome): menu ⋮ then “Install app” or “Add to Home screen”.")}</li>
      <li>{tr("آيفون وآيباد (Safari): زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».", "iPhone & iPad (Safari): Share button then “Add to Home Screen”.")}</li>
      <li>{tr("ويندوز وماك ولينكس (Chrome أو Edge): أيقونة التثبيت في شريط العنوان.", "Windows, macOS & Linux (Chrome or Edge): the install icon in the address bar.")}</li>
      <li>{tr("التطبيق يحتاج اتصالاً بالإنترنت ليعرض بياناتك. بدون اتصال تظهر صفحة تنبيه فقط.", "The app needs an internet connection to show your data. Offline, only a notice page appears.")}</li>
    </ul>
  );
}
