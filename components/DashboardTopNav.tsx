"use client";

import Image from "next/image";
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
import EmailAlertasNav from "@/components/EmailAlertasNav";
import { getSession, type Session } from "@/lib/auth";
import SessionIdleClock from "@/components/SessionIdleClock";

const NAVY = "#0c2340";

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
    href: "/dashboard/comissoes/funcionarios",
    label: "Comissão",
    icon: Percent,
    match: (path: string) => path.startsWith("/dashboard/comissoes/funcionarios"),
  },
] as const;

function isPainelVendas(path: string) {
  return path === "/dashboard/vendas" || path === "/dashboard/vendas/";
}

function userInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function roleLabel(role: Session["role"] | undefined) {
  if (role === "admin") return "Admin";
  if (role === "staff") return "Equipe";
  if (role === "socio") return "Sócio";
  return "";
}

function UserChip({ session }: { session: Session | null }) {
  if (!session) return null;
  return (
    <Link
      href="/dashboard/conta"
      className="flex min-w-0 max-w-[16rem] items-center gap-2.5 rounded-2xl bg-white/10 px-2 py-1.5 ring-1 ring-white/15 transition hover:bg-white/15"
      title="Conta e senha"
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-[12px] font-bold tracking-tight text-white shadow-inner"
        aria-hidden
      >
        {userInitials(session.name)}
      </div>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13px] font-semibold text-white">{session.name}</div>
        <div className="mt-0.5 truncate text-[10px] text-white/70">
          @{session.login}
          <span className="mx-1 text-white/35">·</span>
          {roleLabel(session.role)}
        </div>
      </div>
    </Link>
  );
}

export default function DashboardTopNav() {
  const pathname = usePathname() || "";
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [session, setSessionState] = useState<Session | null>(null);

  useEffect(() => {
    setSessionState(getSession());
  }, []);

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

  const isSocioUser = session?.role === "socio";
  const pending = pendingCount ?? 0;
  const hasPending = pending > 0;
  const painelActive = isPainelVendas(pathname);

  return (
    <header
      className="z-40 shrink-0 border-b border-white/10 shadow-[0_8px_24px_-12px_rgba(12,35,64,0.45)]"
      style={{ backgroundColor: NAVY }}
    >
      <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 pr-1">
          <Image
            src="/trademiles.png"
            alt=""
            width={36}
            height={36}
            unoptimized
            className="h-9 w-9 object-contain"
          />
          <div className="hidden leading-tight sm:block">
            <div className="text-[13px] font-semibold tracking-tight text-white">TradeMiles</div>
            <div className="text-[10px] text-white/55">Vias Aéreas</div>
          </div>
        </Link>

        {isSocioUser ? (
          <div className="min-w-0 flex-1 text-sm font-semibold text-white">Dívida cartões</div>
        ) : (
          <nav
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors",
                    active
                      ? "bg-white text-[#0c2340] shadow-sm"
                      : "text-white/75 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}

            <EmailAlertasNav />

            <span className="mx-1 hidden h-5 w-px shrink-0 bg-white/20 sm:block" aria-hidden />

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
                "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold transition-all",
                hasPending
                  ? cn(
                      "bg-sky-500 text-white shadow-md shadow-sky-900/30 ring-2 ring-sky-300/50",
                      "tm-pending-glow"
                    )
                  : painelActive
                    ? "bg-sky-500 text-white"
                    : "bg-sky-400/15 text-sky-100 ring-1 ring-sky-300/25 hover:bg-sky-400/25"
              )}
            >
              <LayoutDashboard className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">Painel de vendas</span>
              <span
                className={cn(
                  "inline-flex min-w-[1.25rem] items-center justify-center rounded-md px-1 py-0.5 text-[10px] font-bold tabular-nums leading-none",
                  hasPending
                    ? "tm-badge-pop bg-white text-sky-700"
                    : painelActive
                      ? "bg-sky-400/40 text-white"
                      : "bg-sky-300/20 text-sky-100"
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
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold transition-colors",
                    active
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "bg-emerald-400/15 text-emerald-100 ring-1 ring-emerald-300/20 hover:bg-emerald-400/25"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          <SessionIdleClock />
          <UserChip session={session} />
        </div>
      </div>
    </header>
  );
}
