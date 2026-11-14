import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLocale } from "@/lib/i18n";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: { default: "Phoenix Lead Finder", template: "%s · Phoenix Lead Finder" },
  description: "اكتشاف العملاء المحتملين والتواصل اليدوي معهم",
  applicationName: "Phoenix Lead Finder",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Phoenix", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#121820", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body>{children}<ServiceWorker /></body>
    </html>
  );
}
