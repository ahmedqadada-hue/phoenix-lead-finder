import { cookies } from "next/headers";

export type Locale = "ar" | "en";
export type Tr = (ar: string, en: string) => string;

export async function getLocale(): Promise<Locale> {
  return (await cookies()).get("locale")?.value === "en" ? "en" : "ar";
}

/** Arabic is the primary language; English is the secondary one. */
export async function getTr(): Promise<{ tr: Tr; locale: Locale }> {
  const locale = await getLocale();
  return { locale, tr: (ar, en) => (locale === "ar" ? ar : en) };
}
