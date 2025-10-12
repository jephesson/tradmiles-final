// app/dashboard/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

export const dynamic = "force-dynamic"; // garante SSR e leitura do cookie a cada request

type Sess = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  team: string;
  role: "admin" | "staff";
};

export default async function DashboardHome() {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;

  let session: Sess | null = null;
  try {
    session = raw ? (JSON.parse(decodeURIComponent(raw)) as Sess) : null;
  } catch {
    session = null;
  }

  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-slate-600">
            Olá, <span className="font-medium">{session.name}</span>!
          </p>
        </div>
        <LogoutButton />
      </div>

      <div className="rounded-xl border p-4">
        <div className="text-sm font-semibold mb-3">Sua sessão</div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div><span className="text-slate-500">ID:</span> <span className="font-mono">{session.id}</span></div>
          <div><span className="text-slate-500">Login:</span> <span className="font-mono">{session.login}</span></div>
          <div><span className="text-slate-500">Papel:</span> {session.role === "admin" ? "Admin" : "Staff"}</div>
          <div><span className="text-slate-500">Time:</span> {session.team}</div>
          <div className="sm:col-span-2 lg:col-span-3">
            <span className="text-slate-500">E-mail:</span> {session.email || "—"}
          </div>
        </div>
      </div>

      <p className="text-slate-600">
        Escolha uma opção na barra lateral. Sugestão: começar por{" "}
        <a href="/dashboard/cedentes/importar" className="underline">Importar cedentes</a>.
      </p>
    </div>
  );
}
