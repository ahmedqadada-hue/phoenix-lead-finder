import Link from "next/link";
import { priorityOf } from "@/lib/scoring";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h1 className="h1">{title}</h1>{subtitle && <p className="muted mt-1 max-w-3xl">{subtitle}</p>}</div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: number | string; hint?: string; href?: string }) {
  const body = (
    <div className="card h-full p-4 transition-colors hover:border-phoenix/40">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="card grid place-items-center px-6 py-12 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-phoenix-soft text-phoenix">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M11 4a7 7 0 105.2 11.700l4 4 1.400-1.400-4-4A7 7 0 0011 4zm0 2a5 5 0 110 10 5 5 0 010-10z" /></svg>
      </div>
      <div className="font-bold">{title}</div>
      {text && <p className="muted mt-1 max-w-md">{text}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

const TONE: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800", red: "bg-red-50 text-red-700",
  gray: "bg-gray-100 text-gray-600", orange: "bg-phoenix-soft text-phoenix-dark", blue: "bg-sky-50 text-sky-700",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONE | string; children: React.ReactNode }) {
  return <span className={`badge ${TONE[tone] ?? TONE.gray}`}>{children}</span>;
}

export function ScoreBadge({ score }: { score: number }) {
  const p = priorityOf(score);
  return <span className={`badge tabular-nums ${p === "HIGH" ? TONE.green : p === "MEDIUM" ? TONE.amber : TONE.gray}`}>{score}</span>;
}

export const verificationTone = (v: string) => (v === "VERIFIED" ? "green" : v === "LIKELY" ? "amber" : "gray");
export const statusTone = (s: string) =>
  s === "CONVERTED" || s === "INTERESTED" ? "green" : s === "DO_NOT_CONTACT" || s === "NOT_INTERESTED" ? "red" : s === "SENT_MANUALLY" || s === "REPLIED" ? "blue" : s === "NEW" ? "gray" : "orange";
export const providerTone = (s: string) => (s === "OK" ? "green" : s === "UNTESTED" ? "gray" : s === "NOT_CONFIGURED" ? "amber" : "red");

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}</label>;
}

export function Pager({ page, pages, makeHref, prev, next }: { page: number; pages: number; makeHref: (p: number) => string; prev: string; next: string }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      {page > 1 ? <Link className="btn-ghost btn-sm" href={makeHref(page - 1)}>{prev}</Link> : <span />}
      <span className="muted tabular-nums">{page} / {pages}</span>
      {page < pages ? <Link className="btn-ghost btn-sm" href={makeHref(page + 1)}>{next}</Link> : <span />}
    </div>
  );
}

export function ConfigRequired({ title, text, href, cta }: { title: string; text: string; href?: string; cta?: string }) {
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="text-sm font-bold text-amber-900">{title}</div><p className="mt-0.5 text-sm text-amber-800">{text}</p></div>
        {href && cta && <Link href={href} className="btn-dark btn-sm">{cta}</Link>}
      </div>
    </div>
  );
}

export function fmtDate(d: Date | null | undefined, locale: string, withTime = false): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(d);
}
