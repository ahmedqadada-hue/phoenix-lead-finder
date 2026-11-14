import { PhoenixMark } from "@/components/Logo";

export const metadata = { title: "غير متصل" };

export default function Offline() {
  return (
    <main className="min-h-screen grid place-items-center bg-charcoal p-6 text-center text-offwhite">
      <div className="max-w-sm">
        <div className="mx-auto mb-5 w-fit"><PhoenixMark size={72} /></div>
        <h1 className="text-xl font-bold">لا يوجد اتصال بالإنترنت</h1>
        <p className="mt-2 text-sm text-gray-300">يحتاج Phoenix Lead Finder إلى الاتصال بالخادم لعرض بياناتك. تحقق من الشبكة ثم أعد المحاولة.</p>
        <p className="mt-4 text-sm text-gray-400" dir="ltr">You are offline. Phoenix Lead Finder needs a connection to load your data.</p>
        <a href="/" className="btn-primary mt-6">إعادة المحاولة · Retry</a>
      </div>
    </main>
  );
}
