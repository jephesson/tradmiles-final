// app/dashboard/layout.tsx
import Sidebar from "@/components/Sidebar";
import DashboardTopNav from "@/components/DashboardTopNav";
import AuthGuard from "@/components/AuthGuard";
import DashboardPresencePing from "./DashboardPresencePing";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <DashboardPresencePing />
      <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-[100vw] flex-col overflow-hidden bg-slate-100 text-slate-900">
        <DashboardTopNav />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <Sidebar />
          <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-[#f4f7fb]">
            <div className="w-full px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
