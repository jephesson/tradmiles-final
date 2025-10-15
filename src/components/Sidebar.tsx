"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { getSession, signOut } from "@/lib/auth";

const RATEIO_PWD = "ufpb2010";
const RATEIO_FLAG = "TM_RATEIO_OK";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const session = getSession();

  /** =========================
   *  Itens principais
   * ========================= */
  const cedentesItems = useMemo(
    () => [
      { label: "Importar", href: "/dashboard/cedentes/importar" },
      { label: "Visualizar", href: "/dashboard/cedentes/visualizar" },
      { label: "Inserir manualmente", href: "/dashboard/cedentes/novo" },
      { label: "Bloqueios", href: "/dashboard/bloqueios" },
    ],
    []
  );

  const comprasItems = useMemo(
    () => [
      { label: "Lista de compras", href: "/dashboard/compras" },
      { label: "Nova compra", href: "/dashboard/compras/nova" },
    ],
    []
  );

  const vendasItems = useMemo(
    () => [
      { label: "Lista de vendas", href: "/dashboard/vendas" },
      { label: "Nova venda", href: "/dashboard/vendas/nova" },
    ],
    []
  );

  /** =========================
   *  Controle de rotas
   * ========================= */
  const isCedentesRoute =
    pathname.startsWith("/dashboard/cedentes") ||
    pathname.startsWith("/dashboard/bloqueios");
  const isComprasRoute = pathname.startsWith("/dashboard/compras");
  const isVendasRoute = pathname.startsWith("/dashboard/vendas");

  // Funcionários
  const isRateioRoute = pathname.startsWith("/dashboard/funcionarios/rateio");
  const isFuncionariosSyncRoute = pathname.startsWith("/dashboard/funcionarios/sincronizar");
  const isFuncionariosBaseRoute =
    pathname.startsWith("/dashboard/funcionarios") &&
    !isRateioRoute; // inclui /funcionarios e /funcionarios/sincronizar

  const isClientesRoute = pathname.startsWith("/dashboard/clientes");

  const isLucrosRoute = pathname.startsWith("/dashboard/lucros");
  const isResumoRoute = pathname.startsWith("/dashboard/resumo");

  const isAnaliseRoute = pathname.startsWith("/dashboard/analise");
  const isDividasRoute = pathname.startsWith("/dashboard/dividas");

  // novos (contador de passageiros/CPF)
  const isCpfRoute = pathname.startsWith("/dashboard/cpf");
  const isCpfImportRoute = pathname.startsWith("/dashboard/cpf/importar");

  /** =========================
   *  Estado dos acordeões
   * ========================= */
  const [openCedentes, setOpenCedentes] = useState(isCedentesRoute);
  const [openCompras, setOpenCompras] = useState(isComprasRoute);
  const [openVendas, setOpenVendas] = useState(isVendasRoute);

  // NOVOS acordeões
  const [openAnalise, setOpenAnalise] = useState(
    isAnaliseRoute || isDividasRoute || isCpfRoute || isCpfImportRoute
  );
  const [openLucros, setOpenLucros] = useState(isResumoRoute || isLucrosRoute);

  // NOVO: acordeão Funcionários (lista + sincronizar)
  const [openFuncionarios, setOpenFuncionarios] = useState(isFuncionariosBaseRoute);

  useEffect(() => setOpenCedentes(isCedentesRoute), [isCedentesRoute]);
  useEffect(() => setOpenCompras(isComprasRoute), [isComprasRoute]);
  useEffect(() => setOpenVendas(isVendasRoute), [isVendasRoute]);

  useEffect(() => {
    setOpenAnalise(isAnaliseRoute || isDividasRoute || isCpfRoute || isCpfImportRoute);
  }, [isAnaliseRoute, isDividasRoute, isCpfRoute, isCpfImportRoute]);

  useEffect(() => {
    setOpenLucros(isResumoRoute || isLucrosRoute);
  }, [isResumoRoute, isLucrosRoute]);

  useEffect(() => {
    setOpenFuncionarios(isFuncionariosBaseRoute);
  }, [isFuncionariosBaseRoute]);

  /** =========================
   *  Quick Filter (Cedentes)
   * ========================= */
  const isCedentesVisualizar = pathname.startsWith("/dashboard/cedentes/visualizar");
  const programa = (search?.get("programa") || "").toLowerCase();
  const programas = [
    { key: "", label: "Todas" },
    { key: "latam", label: "Latam" },
    { key: "esfera", label: "Esfera" },
    { key: "livelo", label: "Livelo" },
    { key: "smiles", label: "Smiles" },
  ] as const;

  const setQuery = (patch: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(search?.toString() || "");
    Object.entries(patch).forEach(([k, v]) => {
      if (!v) qs.delete(k);
      else qs.set(k, String(v));
    });
    router.push(`${pathname}?${qs.toString()}`);
  };

  /** =========================
   *  Auxiliares
   * ========================= */
  const isComprasItemActive = (href: string) =>
    href === "/dashboard/compras"
      ? pathname === "/dashboard/compras"
      : pathname.startsWith(href);

  const isVendasItemActive = (href: string) =>
    href === "/dashboard/vendas"
      ? pathname === "/dashboard/vendas"
      : pathname.startsWith(href);

  const isFuncionariosItemActive = (href: string) =>
    href === "/dashboard/funcionarios"
      ? pathname === "/dashboard/funcionarios"
      : pathname.startsWith(href);

  /** =========================
   *  Senha do Rateio
   * ========================= */
  function askRateioPasswordAndGo() {
    try {
      if (typeof window !== "undefined" && sessionStorage.getItem(RATEIO_FLAG) === "1") {
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
    } catch {
      const input = window.prompt("Digite a senha para editar o rateio:");
      if (input === RATEIO_PWD) router.push("/dashboard/funcionarios/rateio");
      else alert("Senha incorreta.");
    }
  }

  /** =========================
   *  Renderização
   * ========================= */
  return (
    <aside
      className={cn(
        "w-64 shrink-0 border-r border-slate-200 bg-white",
        "sticky top-0 h-screen overflow-y-auto"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <Image src="/trademiles.png" alt="TradeMiles" width={32} height={32} />
          <span className="font-semibold">TradeMiles</span>
        </div>

        {session && (
          <button
            onClick={() => {
              signOut();
              router.replace("/login");
            }}
            className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50"
            title="Sair"
          >
            Sair
          </button>
        )}
      </div>

      {/* Usuário */}
      {session && (
        <div className="border-b border-slate-200 px-4 py-3 text-xs text-slate-600">
          <div className="truncate font-medium text-slate-800">{session.name}</div>
          <div className="truncate">Login: {session.login}</div>
          <div className="truncate">Time: {session.team}</div>
          <div className="capitalize">Perfil: {session.role}</div>
        </div>
      )}

      {/* Navegação */}
      <nav className="space-y-1 px-2 py-4">
        {/* === Cedentes === */}
        <Accordion
          title="Cedentes"
          open={openCedentes}
          onToggle={() => setOpenCedentes((v) => !v)}
          active={isCedentesRoute}
        >
          <ul className="mt-1 space-y-1">
            {cedentesItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block rounded-lg px-3 py-2 pl-8 text-sm transition-colors",
                      active ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {isCedentesVisualizar && (
            <div className="mt-2 space-y-2 pb-2 pl-6 pr-2">
              <div className="pl-2 text-[11px] text-slate-500">Programa</div>
              <div className="flex flex-wrap gap-1">
                {programas.map((p) => {
                  const active = programa === p.key;
                  return (
                    <button
                      key={p.key || "todas"}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        active ? "border-black bg-black text-white"
                        : "border-slate-200 text-slate-700 hover:bg-slate-100"
                      )}
                      onClick={() => setQuery({ programa: p.key || undefined })}
                      aria-pressed={active}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Accordion>

        {/* === Compras === */}
        <Accordion
          title="Compras de pontos"
          open={openCompras}
          onToggle={() => setOpenCompras((v) => !v)}
          active={isComprasRoute}
        >
          <ul className="mt-1 space-y-1">
            {comprasItems.map((item) => {
              const active = isComprasItemActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block rounded-lg px-3 py-2 pl-8 text-sm transition-colors",
                      active ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Accordion>

        {/* === Vendas === */}
        <Accordion
          title="Vendas"
          open={openVendas}
          onToggle={() => setOpenVendas((v) => !v)}
          active={isVendasRoute}
        >
          <ul className="mt-1 space-y-1">
            {vendasItems.map((item) => {
              const active = isVendasItemActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block rounded-lg px-3 py-2 pl-8 text-sm transition-colors",
                      active ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Accordion>

        {/* Comissão */}
        <Link
          href="/dashboard/comissoes"
          className={cn(
            "mt-2 block rounded-lg px-3 py-2 text-sm transition-colors",
            pathname.startsWith("/dashboard/comissoes")
              ? "bg-black text-white"
              : "text-slate-700 hover:bg-slate-100"
          )}
          aria-current={pathname.startsWith("/dashboard/comissoes") ? "page" : undefined}
        >
          Comissão de cedentes
        </Link>

        {/* === Análise de dados (acordeão) === */}
        <div className="my-3 border-t border-slate-200" />
        <Accordion
          title="Análise de dados"
          open={openAnalise}
          onToggle={() => setOpenAnalise((v) => !v)}
          active={isAnaliseRoute || isDividasRoute || isCpfRoute || isCpfImportRoute}
        >
          <div className="space-y-1">
            <Link
              href="/dashboard/analise"
              className={cn(
                "block rounded-lg px-3 py-2 text-sm transition-colors",
                isAnaliseRoute ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100"
              )}
              aria-current={isAnaliseRoute ? "page" : undefined}
            >
              📊 Análise geral
            </Link>

            <Link
              href="/dashboard/cpf"
              className={cn(
                "block rounded-lg px-3 py-2 text-sm transition-colors",
                isCpfRoute && !isCpfImportRoute ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100"
              )}
              aria-current={isCpfRoute && !isCpfImportRoute ? "page" : undefined}
            >
              🧮 Contador de passageiros (CPF)
            </Link>

            <Link
              href="/dashboard/cpf/importar"
              className={cn(
                "block rounded-lg px-3 py-2 text-sm transition-colors",
                isCpfImportRoute ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100"
              )}
              aria-current={isCpfImportRoute ? "page" : undefined}
            >
              📥 Importar contagem
            </Link>

            <Link
              href="/dashboard/dividas"
              className={cn(
                "block rounded-lg px-3 py-2 text-sm transition-colors",
                isDividasRoute ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100"
              )}
              aria-current={isDividasRoute ? "page" : undefined}
            >
              💰 Dívidas
            </Link>
          </div>
        </Accordion>

        {/* === Lucros (acordeão) === */}
        <div className="my-3 border-t border-slate-200" />
        <Accordion
          title="💹 Lucros"
          open={openLucros}
          onToggle={() => setOpenLucros((v) => !v)}
          active={isResumoRoute || isLucrosRoute}
        >
          <div className="space-y-1">
            <Link
              href="/dashboard/resumo"
              className={cn(
                "block rounded-lg px-3 py-2 text-sm transition-colors",
                isResumoRoute ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100"
              )}
              aria-current={isResumoRoute ? "page" : undefined}
            >
              Resumo (Lucros & Pagamentos)
            </Link>
            <Link
              href="/dashboard/lucros"
              className={cn(
                "block rounded-lg px-3 py-2 text-sm transition-colors",
                isLucrosRoute ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100"
              )}
              aria-current={isLucrosRoute ? "page" : undefined}
            >
              Lucros e Pagamentos
            </Link>
          </div>
        </Accordion>

        {/* === Rateio === */}
        <div className="my-3 border-t border-slate-200" />
        <div className="px-2">
          <div className="px-1 pb-1 text-[11px] uppercase tracking-wide text-slate-500">
            Rateio de lucro
          </div>
          <div className="space-y-1">
            <Link
              href="/dashboard/funcionarios/rateio?view=1"
              className={cn(
                "block rounded-lg px-3 py-2 text-sm transition-colors",
                isRateioRoute && search?.get("view") === "1"
                  ? "bg-black text-white"
                  : "text-slate-700 hover:bg-slate-100"
              )}
              aria-current={
                isRateioRoute && search?.get("view") === "1" ? "page" : undefined
              }
            >
              Ver rateio
            </Link>
            <button
              type="button"
              onClick={askRateioPasswordAndGo}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                isRateioRoute && search?.get("view") !== "1"
                  ? "bg-black text-white"
                  : "text-slate-700 hover:bg-slate-100"
              )}
            >
              Editar rateio (senha)
            </button>
          </div>
        </div>

        {/* === Funcionários (lista + sincronizar) === */}
        <div className="my-3 border-t border-slate-200" />
        <Accordion
          title="Funcionários"
          open={openFuncionarios}
          onToggle={() => setOpenFuncionarios((v) => !v)}
          active={isFuncionariosBaseRoute && !isRateioRoute}
        >
          <ul className="mt-1 space-y-1">
            <li>
              <Link
                href="/dashboard/funcionarios"
                className={cn(
                  "block rounded-lg px-3 py-2 pl-8 text-sm transition-colors",
                  isFuncionariosItemActive("/dashboard/funcionarios") &&
                  !isFuncionariosSyncRoute
                    ? "bg-black text-white"
                    : "text-slate-700 hover:bg-slate-100"
                )}
                aria-current={
                  isFuncionariosItemActive("/dashboard/funcionarios") &&
                  !isFuncionariosSyncRoute
                    ? "page"
                    : undefined
                }
              >
                Lista de funcionários
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/funcionarios/sincronizar"
                className={cn(
                  "block rounded-lg px-3 py-2 pl-8 text-sm transition-colors",
                  isFuncionariosSyncRoute
                    ? "bg-black text-white"
                    : "text-slate-700 hover:bg-slate-100"
                )}
                aria-current={isFuncionariosSyncRoute ? "page" : undefined}
              >
                Sincronizar aos cedentes
              </Link>
            </li>
          </ul>
        </Accordion>

        {/* === Clientes === */}
        <div className="my-3 border-t border-slate-200" />
        <Link
          href="/dashboard/clientes"
          className={cn(
            "block rounded-lg px-3 py-2 text-sm transition-colors",
            isClientesRoute ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100"
          )}
          aria-current={isClientesRoute ? "page" : undefined}
        >
          Clientes
        </Link>
      </nav>
    </aside>
  );
}

/** =========================
 *  Acordeão reutilizável
 * ========================= */
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
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
          active ? "bg-black text-white" : "text-slate-700 hover:bg-slate-100"
        )}
        aria-expanded={open}
      >
        <span>{title}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={cn("h-4 w-4 transition-transform", open ? "rotate-90" : "rotate-0")}
        >
          <path
            d="M8.25 4.5l7.5 7.5-7.5 7.5"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div
        className={cn(
          "overflow-hidden transition-[max-height] duration-300",
          open ? "max-h-[1000px]" : "max-h-0"
        )}
      >
        {children}
      </div>
    </>
  );
}
