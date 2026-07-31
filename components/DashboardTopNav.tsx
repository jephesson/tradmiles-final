"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarDays, Home, Mail, Trophy } from "lucide-react";
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

export default function DashboardTopNav() {
  const pathname = usePathname() || "";

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
      </nav>
    </div>
  );
}
