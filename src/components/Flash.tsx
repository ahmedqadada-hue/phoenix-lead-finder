import { FLASH } from "@/lib/flash";
import { getLocale } from "@/lib/i18n";

export async function Flash({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const locale = await getLocale();
  const err = typeof searchParams.error === "string" ? searchParams.error : null;
  const ok = typeof searchParams.ok === "string" ? searchParams.ok : null;
  const code = err ?? ok;
  if (!code) return null;
  const text = FLASH[code]?.[locale] ?? code;
  return (
    <div role={err ? "alert" : "status"} className={`mb-4 rounded-lg border px-4 py-3 text-sm font-medium ${err ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      {text}
    </div>
  );
}
