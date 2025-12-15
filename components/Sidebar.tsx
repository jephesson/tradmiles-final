// components/Sidebar.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { getSession, signOut } from "@/lib/auth";

const RATEIO_FLAG = "TM_RATEIO_OK";

const RATEIO_PWD =
  process.env.NEXT_PUBLIC_RATEIO_PWD?.trim() || "ufpb2010";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const session = getSession();

  /* =========================
   * ROTAS
   * ========================= */
  const isCadastroRoute =
    pathname.startsWith("/dashboard/cedentes") ||
    pathname.startsWith("/dashboard/bloqueios") ||
    pathname.startsWith("/dashboard/clientes") ||
    pathname.startsWith("/dashboard/funcionarios");

  const isGestaoPontosRoute =
    pathname.startsWith("/dashboard/compras") ||
    pathname.startsWith("/dashboard/vendas");

  const isLucrosRoute =
    pathname.startsWith("/dashboard/lucros") ||
    pathname.startsWith("/dashboard/resumo") ||
    pathname.startsWith("/dashboard/comissoes") ||
    pathname.startsWith("/dashboard/funcionarios/rateio");

  const isAnaliseRoute =
    pathname.startsWith("/dashboard/analise") ||
    pathname.startsWith("/dashboard/dividas") ||
    pathname.startsWith("/dashboard/cpf");

  const isCedentesVisualizar = pathname.startsWith("/dashboard/cedentes/visualizar");

  const isRateioRoute = pathname.startsWith("/dashboard/funcionarios/rateio");

  const isFuncionariosSyncRoute = pathname.startsWith(
    "/dashboard/funcionarios/sincronizar"
  );

  /* =========================
   * ACCORDIONS
   * ========================= */
  const [openCadastro, setOpenCadastro] = useState(isCadastroRoute);
  const [openGestaoPontos, setOpenGestaoPontos] = useState(isGestaoPontosRoute);
  const [openLucros, setOpenLucros] = useState(isLucrosRoute);
  const [openAnalise, setOpenAnalise] = useState(isAnaliseRoute);

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setOpenCadastro(isCadastroRoute), [isCadastroRoute]);
  useEffect(() => setOpenGestaoPontos(isGestaoPontosRoute), [isGestaoPontosRoute]);
  useEffect(() => setOpenLucros(isLucrosRoute), [isLucrosRoute]);
  useEffect(() => setOpenAnalise(isAnaliseRoute), [isAnaliseRoute]);

  useEffect(() => setMobileOpen(false), [pathname]);

  /* =========================
   * QUICK FILTER (CEDENTES)
   * ========================= */
  const programa = (search?.get("programa") || "").toLowerCase();

  const programas = [
    { key: "", label: "Todas" },
    { key: "latam", label: "Latam" },
    { key: "esfera", label: "Esfera" },
    { key: "livelo", label: "Livelo" },
    { key: "smiles", label: "Smiles" },
  ];

  function setQuery(patch: Record<string, string | undefined>) {
    const qs = new URLSearchParams(search?.toString() || "");
    for (const [k, v] of Object.entries(patch)) {
      if (!v) qs.delete(k);
      else qs.set(k, v);
    }
    const q = qs.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  /* =========================
   * RATEIO
   * ========================= */
  function askRateioPasswordAndGo() {
    if (typeof window === "undefined") return;

    if (sessionStorage.getItem(RATEIO_FLAG) === "1") {
      router.push("/dashboard/funcionarios/rateio");
      return;
    }

    const input = window.prompt("Digite a senha para editar o rateio:");
    if (!input) return;

    if (input === RATEIO_PWD) {
      sessionStorage.setItem(RATEIO_FLAG, "1");
      router.push("/dashboard/funcionarios/rateio");
    } else {
      alert("Senha incorreta.");
    }
  }

  function doLogout() {
    signOut();
    router.replace("/login");
  }

  /* =========================
   * UI
   * ========================= */
  const AsideInner = (
    <aside className="w-64 shrink-0 border-r border-slate-200 bg-white h-screen overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-3">
          <Image src="/trademiles.png" alt="TradeMiles" width={32} height={32} />
          <span className="font-semibold">TradeMiles</span>
        </div>
        {session && (
          <button onClick={doLogout} className="text-xs border px-2 py-1 rounded">
            Sair
          </button>
        )}
      </div>

      {/* Usuário */}
      {session && (
        <div className="border-b px-4 py-3 text-xs">
          <div className="font-medium">{session.name}</div>
          <div>Login: {session.login}</div>
          <div>Time: {session.team}</div>
          <div className="capitalize">Perfil: {session.role}</div>
        </div>
      )}

      <nav className="space-y-2 px-2 py-4">
        {/* ================= CADASTRO ================= */}
        <Accordion title="Cadastro" open={openCadastro} onToggle={() => setOpenCadastro(v => !v)} active={isCadastroRoute}>
          <NavLink href="/dashboard/cedentes/importar">Importar cedentes</NavLink>
          <NavLink href="/dashboard/cedentes/visualizar">Visualizar cedentes</NavLink>
          <NavLink href="/dashboard/cedentes/novo">Cadastrar cedente</NavLink>
          <NavLink href="/dashboard/bloqueios">Bloqueios</NavLink>
          <NavLink href="/dashboard/clientes">Clientes</NavLink>
          <NavLink href="/dashboard/funcionarios/sincronizar">Sincronizar funcionários</NavLink>

          {isCedentesVisualizar && (
            <div className="mt-2 pl-6">
              <div className="text-[11px] text-slate-500 mb-1">Programa</div>
              <div className="flex flex-wrap gap-1">
                {programas.map(p => (
                  <button
                    key={p.key}
                    className={cn(
                      "px-3 py-1 text-xs rounded-full border",
                      programa === p.key && "bg-black text-white"
                    )}
                    onClick={() => setQuery({ programa: p.key || undefined })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Accordion>

        {/* ================= GESTÃO DE PONTOS ================= */}
        <Accordion title="Gestão de pontos" open={openGestaoPontos} onToggle={() => setOpenGestaoPontos(v => !v)} active={isGestaoPontosRoute}>
          <NavLink href="/dashboard/cedentes/visualizar">Visualizar pontos</NavLink>
          <NavLink href="/dashboard/compras">Compras de pontos</NavLink>
          <NavLink href="/dashboard/compras/nova">Nova compra</NavLink>
          <NavLink href="/dashboard/vendas">Vendas de pontos</NavLink>
          <NavLink href="/dashboard/vendas/nova">Nova venda</NavLink>
        </Accordion>

        {/* ================= LUCROS ================= */}
        <Accordion title="Lucros & Comissões" open={openLucros} onToggle={() => setOpenLucros(v => !v)} active={isLucrosRoute}>
          <NavLink href="/dashboard/resumo">Resumo</NavLink>
          <NavLink href="/dashboard/lucros">Lucros e Pagamentos</NavLink>
          <NavLink href="/dashboard/comissoes">Comissão de cedentes</NavLink>
          <NavLink href="/dashboard/funcionarios/rateio?view=1">Ver rateio</NavLink>
          <button onClick={askRateioPasswordAndGo} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-slate-100">
            Editar rateio (senha)
          </button>
        </Accordion>

        {/* ================= ANÁLISE ================= */}
        <Accordion title="Análise de dados" open={openAnalise} onToggle={() => setOpenAnalise(v => !v)} active={isAnaliseRoute}>
          <NavLink href="/dashboard/analise">Análise geral</NavLink>
          <NavLink href="/dashboard/cpf">Contador CPF</NavLink>
          <NavLink href="/dashboard/cpf/importar">Importar CPF</NavLink>
          <NavLink href="/dashboard/dividas">Dívidas</NavLink>
        </Accordion>
      </nav>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block">{AsideInner}</div>
      {mobileOpen && <div className="lg:hidden">{AsideInner}</div>}
    </>
  );
}

/* =========================
 * COMPONENTES AUXILIARES
 * ========================= */
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-lg px-3 py-2 text-sm",
        active ? "bg-black text-white" : "hover:bg-slate-100"
      )}
    >
      {children}
    </Link>
  );
}

function Accordion({
  title,
  open,
  onToggle,
  active,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex justify-between items-center px-3 py-2 rounded text-sm",
          active ? "bg-black text-white" : "hover:bg-slate-100"
        )}
      >
        <span>{title}</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="pl-4 space-y-1">{children}</div>}
    </>
  );
}
