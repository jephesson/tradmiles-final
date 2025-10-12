// app/dashboard/layout.tsx
"use client";

import Sidebar from "@/components/Sidebar";
import AuthGuard from "@/components/AuthGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      {/* ocupa 100% da viewport e bloqueia overflow horizontal da página */}
      <div className="min-h-screen w-screen bg-white text-slate-900 overflow-x-hidden">
        {/* linha principal: sidebar + conteúdo */}
        <div className="flex w-full">
          {/* Sidebar fixa; o componente já se adapta no mobile */}
          <Sidebar />

          {/* Conteúdo: min-w-0 evita forçar rolagem horizontal quando há tabelas largas */}
          <main className="flex-1 min-w-0">
            {/* padding só aqui (sem max-width!) */}
            <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
