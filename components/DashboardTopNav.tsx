"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  Home,
  LayoutDashboard,
  Mail,
  Percent,
  ShoppingBag,
  ShoppingCart,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/cn";

const ITEMS = [
  {
    href: "/dashboard",
    label: "Página inicial",
    icon: Home,
    match: (path: string) => path === "/dashboard" || path === "/dashboard/",
  },
  {
    href: "/dashboard/bonus",
    label: "Bônus",
    icon: Trophy,
    match: (path: string) => path.startsWith("/dashboard/bonus"),
  },
  {
    href: "/dashboard/agenda",
    label: "Agenda",
    icon: CalendarDays,
    match: (path: string) => path.startsWith("/dashboard/agenda"),
  },
  {
    href: "/dashboard/avisos",
    label: "Avisos",
    icon: Bell,
    match: (path: string) => path.startsWith("/dashboard/avisos"),
  },
  {
    href: "/dashboard/emails",
    label: "E-mail",
    icon: Mail,
    match: (path: string) => path.startsWith("/dashboard/emails"),
  },
] as const;

const ACTION_ITEMS = [
  {
    href: "/dashboard/vendas/nova",
    label: "Vender",
    icon: ShoppingBag,
    match: (path: string) => path.startsWith("/dashboard/vendas/nova"),
  },
  {
    href: "/dashboard/compras/nova",
    label: "Comprar",
    icon: ShoppingCart,
    match: (path: string) => path.startsWith("/dashboard/compras"),
  },
  {
    href: "/dashboard/comissoes/cedentes",
    label: "Comissão",
    icon: Percent,
    match: (path: string) => path.startsWith("/dashboard/comissoes"),
  },
] as const;

function isPainelVendas(path: string) {
  return path === "/dashboard/vendas" || path === "/dashboard/vendas/";
}

export default function DashboardTopNav() {
  const pathname = usePathname() || "";
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch("/api/vendas/pending-count", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && json?.ok) setPendingCount(Number(json.count) || 0);
      } catch {
        if (alive) setPendingCount(null);
      }
    }

    void load();
    const t = window.setInterval(() => void load(), 60_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  const pending = pendingCount ?? 0;
  const hasPending = pending > 0;
  const painelActive = isPainelVendas(pathname);

  return (
    <div className="shrink-0 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
      <nav
        className="flex items-stretch gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden"
        aria-label="Atalhos principais"
      >
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold transition-colors",
                active
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              <span className="whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}

        <div
          className="mx-1.5 hidden h-6 w-px self-center bg-slate-300 sm:block"
          aria-hidden
        />
        <span className="mx-1 self-center text-slate-300 sm:hidden" aria-hidden>
          |
        </span>

        <Link
          href="/dashboard/vendas"
          title={
            hasPending
              ? `${pending} venda${pending === 1 ? "" : "s"} pendente${
                  pending === 1 ? "" : "s"
                } de pagamento`
              : "Nenhuma venda pendente de pagamento"
          }
          className={cn(
            "relative inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] font-bold transition-all",
            hasPending
              ? cn(
                  "bg-sky-600 text-white shadow-md shadow-sky-600/30 ring-2 ring-sky-300/70",
                  "tm-pending-glow"
                )
              : cn(
                  "bg-sky-50 text-sky-700 ring-1 ring-sky-200/90",
                  "hover:bg-sky-100 hover:text-sky-900"
                ),
            painelActive && hasPending && "bg-sky-700 ring-sky-200",
            painelActive && !hasPending && "bg-sky-600 text-white ring-sky-500"
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden />
          <span className="whitespace-nowrap">Painel de vendas</span>
          <span
            className={cn(
              "inline-flex min-w-[1.35rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums leading-none",
              hasPending
                ? "tm-badge-pop bg-white text-sky-700 shadow-sm"
                : painelActive
                ? "bg-sky-500/40 text-white"
                : "bg-sky-100 text-sky-500"
            )}
          >
            {pendingCount == null ? "…" : pending}
          </span>
        </Link>

        {ACTION_ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13px] font-bold transition-colors",
                active
                  ? "bg-emerald-700 text-white shadow-sm shadow-emerald-900/15"
                  : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80 hover:bg-emerald-100 hover:text-emerald-950"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
