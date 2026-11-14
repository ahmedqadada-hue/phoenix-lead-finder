import Link from "next/link";
import { STATUS_LABEL, pick } from "@/lib/labels";
import type { Locale } from "@/lib/i18n";
import { Badge, ScoreBadge, statusTone } from "./ui";

export function LeadPicker({ leads, selected, base, locale, extra = "" }: { leads: { id: string; name: string; city: string; score: number; status: string }[]; selected?: string; base: string; locale: Locale; extra?: string }) {
  return (
    <div className="card max-h-[70vh] divide-y divide-line overflow-y-auto">
      {leads.map((l) => (
        <Link key={l.id} href={`${base}?lead=${l.id}${extra}`} aria-current={selected === l.id ? "true" : undefined} className={`flex items-center justify-between gap-2 p-3 ${selected === l.id ? "bg-phoenix-soft" : "hover:bg-offwhite"}`}>
          <div className="min-w-0"><div className="truncate text-sm font-semibold">{l.name}</div><div className="text-xs text-gray-500">{l.city || "—"}</div></div>
          <div className="flex shrink-0 items-center gap-1.5"><Badge tone={statusTone(l.status)}>{pick(STATUS_LABEL, l.status, locale)}</Badge><ScoreBadge score={l.score} /></div>
        </Link>
      ))}
    </div>
  );
}
