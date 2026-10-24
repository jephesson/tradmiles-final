"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  Mail,
  Percent,
  ShoppingBag,
  ShoppingCart,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { getSession } from "@/lib/auth";

const SHORTCUTS = [
  {
    href: "/dashboard/vendas",
    label: "Painel de vendas",
    icon: LayoutDashboard,
    tone: "sky",
    pending: true,
  },
  {
    href: "/dashboard/vendas/nova",
    label: "Vender",
    icon: ShoppingBag,
    tone: "emerald",
  },
  {
    href: "/dashboard/compras/nova",
    label: "Comprar",
    icon: ShoppingCart,
    tone: "emerald",
  },
  {
    href: "/dashboard/comissoes/funcionarios",
    label: "Comissão",
    icon: Percent,
    tone: "slate",
  },
  {
    href: "/dashboard/agenda",
    label: "Agenda",
    icon: CalendarDays,
    tone: "slate",
  },
  {
    href: "/dashboard/bonus",
    label: "Bônus",
    icon: Trophy,
    tone: "slate",
  },
  {
    href: "/dashboard/avisos",
    label: "Avisos",
    icon: Bell,
    tone: "slate",
  },
  {
    href: "/dashboard/emails",
    label: "E-mail",
    icon: Mail,
    tone: "slate",
  },
] as const;

const TONE: Record<string, string> = {
  sky: "border-sky-200 bg-sky-50 text-sky-950",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
  slate: "border-slate-200 bg-white text-slate-900",
};

export default function MobileHomeShortcuts() {
  const [pending, setPending] = useState<number | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setRole(getSession()?.role || null);
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/vendas/pending-count", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && json?.ok) setPending(Number(json.count) || 0);
      } catch {
        if (alive) setPending(null);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  if (role === "socio") return null;

  return (
    <section className="lg:hidden">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Atalhos
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {SHORTCUTS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-[3.25rem] items-center gap-2.5 rounded-2xl border px-3 py-3 text-sm font-semibold shadow-sm",
                TONE[item.tone]
              )}
            >
              <Icon className="h-5 w-5 shrink-0 opacity-80" aria-hidden />
              <span className="min-w-0 flex-1 leading-tight">{item.label}</span>
              {"pending" in item && item.pending ? (
                <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-md bg-sky-600 px-1 py-0.5 text-[10px] font-bold tabular-nums text-white">
                  {pending == null ? "…" : pending}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
