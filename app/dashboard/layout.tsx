// app/dashboard/layout.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function SidebarFallback({ className }: { className?: string }) {
  return (
    <div className={cn("w-[280px] shrink-0 bg-white", className)}>
      <div className="p-4 text-sm text-slate-500">Carregando menu…</div>
    </div>
  );
}

function PageFallback() {
  return <div className="p-4 text-sm text-slate-500">Carregando…</div>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // ✅ fecha drawer ao trocar rota (back/forward)
  useEffect(() => {
    const onPop = () => setMobileOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ✅ trava scroll do body quando drawer estiver aberto
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <AuthGuard>
      {/* ✅ usa dvh no mobile (melhor que min-h-screen) */}
      <div className="min-h-dvh w-full bg-white text-slate-900">
        <div className="flex w-full">
          {/* =====================
              SIDEBAR DESKTOP
              ===================== */}
          <div className="hidden lg:block">
            {/* ✅ FIX: useSearchParams no Sidebar precisa Suspense */}
            <Suspense fallback={<SidebarFallback className="border-r" />}>
              <Sidebar />
            </Suspense>
          </div>

          {/* =====================
              MOBILE: TOP BAR
              ===================== */}
          <div className="lg:hidden fixed top-0 left-0 right-0 z-40 border-b bg-white/95 backdrop-blur">
            <div className="mx-auto w-full max-w-screen-2xl px-4 py-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 active:scale-[0.99]"
                aria-label="Abrir menu"
              >
                ☰ Menu
              </button>

              <div className="text-sm font-semibold">TradeMiles</div>

              {/* espaçador pra centralizar o título */}
              <div className="w-[78px]" />
            </div>
          </div>

          {/* =====================
              MOBILE: DRAWER + OVERLAY
              ===================== */}
          <div
            className={cn("lg:hidden fixed inset-0 z-50", mobileOpen ? "pointer-events-auto" : "pointer-events-none")}
            aria-hidden={!mobileOpen}
          >
            {/* overlay */}
            <div
              onClick={() => setMobileOpen(false)}
              className={cn(
                "absolute inset-0 bg-black/40 transition-opacity",
                mobileOpen ? "opacity-100" : "opacity-0"
              )}
            />

            {/* drawer */}
            <div
              className={cn(
                "absolute left-0 top-0 h-full w-[86%] max-w-[340px] bg-white shadow-xl transition-transform",
                mobileOpen ? "translate-x-0" : "-translate-x-full"
              )}
            >
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="font-semibold">Menu</div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>

              {/* Sidebar dentro do drawer */}
              <div
                className="h-[calc(100%-56px)] overflow-auto"
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const a = target.closest("a");
                  if (a) setMobileOpen(false);
                }}
              >
                {/* ✅ FIX: também precisa Suspense aqui */}
                <Suspense fallback={<div className="p-4 text-sm text-slate-500">Carregando menu…</div>}>
                  <Sidebar />
                </Suspense>
              </div>
            </div>
          </div>

          {/* =====================
              MAIN
              ===================== */}
          <main className="flex-1 min-w-0">
            {/* no mobile, empurra o conteúdo pra baixo do topbar */}
            <div className="pt-[56px] lg:pt-0">
              {/* ✅ mantém exatamente igual no desktop (lg+) */}
              <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
                {/* ✅ FIX GLOBAL: cobre useSearchParams() em QUALQUER página do dashboard */}
                <Suspense fallback={<PageFallback />}>{children}</Suspense>
              </div>
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
