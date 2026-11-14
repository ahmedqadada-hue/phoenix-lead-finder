"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PhoenixMark } from "./Logo";

export interface NavItem { href: string; label: string; icon: string; group?: string }

const ICONS: Record<string, string> = {
  home: "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z",
  search: "M11 4a7 7 0 105.2 11.7l4 4 1.4-1.4-4-4A7 7 0 0011 4zm0 2a5 5 0 110 10 5 5 0 010-10z",
  users: "M9 11a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-7 2-7 5v2h14v-2c0-3-3-5-7-5zm8-2a3 3 0 100-6 3 3 0 000 6zm1 2c2.500 .5 4 2 4 4v3h-4v-2c0-1.900-.700-3.700-2-5z",
  spark: "M12 2l2.200 6.800L21 11l-6.800 2.200L12 20l-2.200-6.800L3 11l6.800-2.200z",
  chat: "M4 4h16a1 1 0 011 1v11a1 1 0 01-1 1H9l-5 4v-4H4a1 1 0 01-1-1V5a1 1 0 011-1z",
  send: "M3 20l18-8L3 4v6l11 2-11 2z",
  flag: "M5 3v18h2v-7h11l-2-4 2-4H7V3z",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18zm1 4v5l4 2-1 1.700-5-2.700V7z",
  chart: "M4 20V10h3v10zm6 0V4h3v16zm6 0v-7h3v7z",
  cog: "M12 8a4 4 0 100 8 4 4 0 000-8zm9 4l-2.100.800a7 7 0 01-.700 1.700l1 2-1.700 1.700-2-1a7 7 0 01-1.700.700L13 21h-2l-.800-2.100a7 7 0 01-1.700-.700l-2 1-1.700-1.700 1-2a7 7 0 01-.700-1.700L3 13v-2l2.100-.800a7 7 0 01.700-1.700l-1-2L6.500 4.800l2 1a7 7 0 011.700-.700L11 3h2l.800 2.100a7 7 0 011.700.700l2-1 1.700 1.700-1 2a7 7 0 01.700 1.700L21 11z",
  bolt: "M13 2L4 14h6l-1 8 9-12h-6z",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zm0 2c1.200 1.500 2 3.900 2.100 6H9.900C10 8.900 10.800 6.500 12 5zM5.100 11A7 7 0 019 5.700C8.400 7.200 8 9 7.900 11zm0 2h2.800c.100 2 .500 3.800 1.100 5.300A7 7 0 015.100 13zm4.800 0h4.200c-.100 2.100-.900 4.500-2.100 6-1.200-1.500-2-3.900-2.100-6zm5.100 5.300c.600-1.500 1-3.300 1.100-5.300h2.800a7 7 0 01-3.900 5.300zM16.100 11c-.100-2-.500-3.800-1.100-5.300A7 7 0 0118.900 11z",
  shield: "M12 2l8 3v6c0 5-3.400 9.300-8 11-4.600-1.700-8-6-8-11V5z",
  list: "M4 6h2v2H4zm4 0h12v2H8zM4 11h2v2H4zm4 0h12v2H8zm-4 5h2v2H4zm4 0h12v2H8z",
};

export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true"><path d={(ICONS[name] ?? ICONS.list).replace(/(\d)\.(\d)00/g, "$1.$2")} /></svg>;
}

export function Nav({ items, userName, roleLabel, children }: { items: NavItem[]; userName: string; roleLabel: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const groups: { name: string; items: NavItem[] }[] = [];
  for (const it of items) {
    const g = groups.find((x) => x.name === (it.group ?? ""));
    if (g) g.items.push(it); else groups.push({ name: it.group ?? "", items: [it] });
  }
  const menu = (
    <nav className="flex h-full flex-col" aria-label="Main">
      <Link href="/" className="flex items-center gap-3 px-5 py-5">
        <PhoenixMark size={38} />
        <div className="leading-tight"><div className="font-bold text-white">Phoenix</div><div className="text-xs text-gray-400">Lead Finder</div></div>
      </Link>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.name} className="mb-3">
            {g.name && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{g.name}</div>}
            {g.items.map((it) => (
              <Link key={it.href} href={it.href} aria-current={active(it.href) ? "page" : undefined}
                className={`mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active(it.href) ? "bg-phoenix text-white" : "text-gray-300 hover:bg-slate2 hover:text-white"}`}>
                <Icon name={it.icon} className="h-[18px] w-[18px] shrink-0" />{it.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 truncate text-sm font-semibold text-white">{userName}</div>
        <div className="-mt-2 mb-3 text-xs text-gray-400">{roleLabel}</div>
        {children}
      </div>
    </nav>
  );
  return (
    <>
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 bg-charcoal lg:block">{menu}</aside>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-charcoal px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2 font-bold text-white"><PhoenixMark size={30} />Phoenix</Link>
        <button onClick={() => setOpen(true)} aria-label="Menu" aria-expanded={open} className="rounded-lg p-2 text-white hover:bg-slate2">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" /></svg>
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/50" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-charcoal shadow-xl">{menu}</div>
        </div>
      )}
    </>
  );
}
