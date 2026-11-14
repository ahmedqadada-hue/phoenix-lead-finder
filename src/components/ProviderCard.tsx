import type { ProviderConnection } from "@prisma/client";
import { PROVIDER_STATUS_LABEL, pick } from "@/lib/labels";
import type { Locale, Tr } from "@/lib/i18n";
import { currentMonth } from "@/lib/providers/connections";
import { removeProviderKeyAction, saveProviderAction, testProviderAction } from "@/actions/providers";
import { Badge, fmtDate, providerTone } from "./ui";

export function ProviderCard({ kind, id, label, signupUrl, note, requiresKey, defaultLimit, defaultModel, conn, tr, locale, unitLabel, models }: {
  kind: "SEARCH" | "AI"; id: string; label: string; signupUrl: string; note: string; requiresKey: boolean; defaultLimit: number; defaultModel?: string;
  conn: ProviderConnection | null; tr: Tr; locale: Locale; unitLabel: string; models?: string[];
}) {
  const hasKey = !!conn?.encryptedKey;
  const status = requiresKey && !hasKey ? "NOT_CONFIGURED" : (conn?.lastStatus ?? "UNTESTED");
  const used = conn && conn.usageMonth === currentMonth() ? conn.usedThisMonth : 0;
  const limit = conn?.monthlyLimit ?? defaultLimit;
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">{label}</h2>
        <div className="flex items-center gap-2">{conn && !conn.enabled && <Badge>{tr("معطّل", "Disabled")}</Badge>}<Badge tone={providerTone(status)}>{pick(PROVIDER_STATUS_LABEL, status, locale)}</Badge></div>
      </div>
      <p className="muted mt-1">{note}</p>
      <p className="mt-1 text-xs"><a href={signupUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-phoenix underline" dir="ltr">{signupUrl}</a></p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
        <div><div className="text-xs text-gray-500">{tr("الاستخدام هذا الشهر", "Used this month")}</div><div className="font-bold tabular-nums">{used}{limit ? ` / ${limit}` : ""} <span className="text-xs font-normal text-gray-500">{unitLabel}</span></div></div>
        {kind === "AI" && <div><div className="text-xs text-gray-500">{tr("الرموز (دخل / خرج)", "Tokens (in / out)")}</div><div className="font-bold tabular-nums">{conn && conn.usageMonth === currentMonth() ? `${conn.inputTokens} / ${conn.outputTokens}` : "0 / 0"}</div></div>}
        <div><div className="text-xs text-gray-500">{tr("آخر اختبار", "Last test")}</div><div className="font-medium">{fmtDate(conn?.lastTestedAt, locale, true)}</div></div>
      </div>
      {conn?.lastError && status !== "OK" && <div className="mt-3 break-words rounded-lg bg-red-50 p-3 text-xs text-red-800" dir="ltr">{conn.lastError}</div>}
      <form action={saveProviderAction} className="mt-4 grid gap-3 md:grid-cols-2">
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="provider" value={id} />
        {requiresKey && (
          <label className="block md:col-span-2"><span className="label">{tr("مفتاح API", "API key")} {hasKey && <span className="font-normal text-gray-500">({tr("محفوظ", "saved")}: {conn!.keyHint})</span>}</span>
            <input name="apiKey" type="password" autoComplete="off" dir="ltr" className="input" placeholder={hasKey ? tr("اتركه فارغاً للإبقاء على المفتاح الحالي", "Leave empty to keep the current key") : tr("الصق المفتاح هنا", "Paste the key here")} />
            <span className="mt-1 block text-xs text-gray-500">{tr("يُشفَّر على الخادم ولا يُرسَل إلى المتصفح مرة أخرى.", "Encrypted on the server and never sent back to the browser.")}</span></label>
        )}
        {kind === "AI" && (
          <label className="block"><span className="label">{tr("النموذج", "Model")}</span>
            <input name="model" list={`models-${id}`} defaultValue={conn?.model || defaultModel} dir="ltr" className="input" />
            {models && models.length > 0 && <datalist id={`models-${id}`}>{models.map((m) => <option key={m} value={m} />)}</datalist>}
            <span className="mt-1 block text-xs text-gray-500">{models?.length ? tr(`${models.length} نموذجاً متاحاً لمفتاحك، اختر من القائمة.`, `${models.length} models available to your key — pick from the list.`) : tr("بعد «اختبار الاتصال» تظهر النماذج المتاحة لمفتاحك.", "After “Test connection”, the models available to your key are listed.")}</span></label>
        )}
        <label className="block"><span className="label">{tr("الحد الشهري", "Monthly limit")} ({unitLabel})</span>
          <input name="monthlyLimit" type="number" min={0} defaultValue={limit} className="input" />
          <span className="mt-1 block text-xs text-gray-500">{tr("يتوقف التطبيق عن استخدام المزود عند بلوغه. 0 يعني بلا حد.", "The app stops using the provider at this number. 0 means no limit.")}</span></label>
        <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="enabled" defaultChecked={conn ? conn.enabled : true} className="h-4 w-4 accent-phoenix" />{tr("مفعّل", "Enabled")}</label>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button className="btn-primary btn-sm">{tr("حفظ", "Save")}</button>
          <button formAction={testProviderAction} className="btn-ghost btn-sm">{tr("اختبار الاتصال", "Test connection")}</button>
          {hasKey && <button formAction={removeProviderKeyAction} className="btn-danger btn-sm">{tr("حذف المفتاح", "Remove key")}</button>}
        </div>
      </form>
    </section>
  );
}
