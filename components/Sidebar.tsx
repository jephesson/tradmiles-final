"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { getSession, signOut } from "@/lib/auth";

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
    pathname.startsWith("/dashboard/clientes") ||
    pathname.startsWith("/dashboard/funcionarios") ||
    pathname.startsWith("/dashboard/bloqueios");

  const isPontosVisualizarRoute = pathname.startsWith(
    "/dashboard/cedentes/visualizar"
  );

  const isComprasRoute = pathname.startsWith("/dashboard/compras");
  const isVendasRoute = pathname.startsWith("/dashboard/vendas");

  const isGestaoPontosRoute =
    isPontosVisualizarRoute || isComprasRoute || isVendasRoute;

  // ✅ Lucros/Comissões (sem rateio)
  const isLucrosRoute =
    pathname.startsWith("/dashboard/lucros") ||
    pathname.startsWith("/dashboard/comissoes");

  // ✅ ANÁLISE agora é só Resumo
  const isAnaliseRoute = pathname.startsWith("/dashboard/resumo");

  // ✅ FINANCEIRO
  const isDividasRoute = pathname.startsWith("/dashboard/dividas");
  const isRecebimentosRoute = pathname.startsWith("/dashboard/recebimentos");
  const isFinanceiroRoute = isDividasRoute || isRecebimentosRoute;

  // ✅ GESTOR DE EMISSÕES (novo)
  const isGestorEmissoesRoute = pathname.startsWith("/dashboard/emissoes");

  // ✅ Rotas de comissões (subitens)
  const isComissoesCedentesRoute = pathname.startsWith(
    "/dashboard/comissoes/cedentes"
  );
  const isComissoesFuncionariosRoute = pathname.startsWith(
    "/dashboard/comissoes/funcionarios"
  );
  const isComissoesSubRoute =
    isComissoesCedentesRoute || isComissoesFuncionariosRoute;

  /* =========================
   * ACCORDIONS
   * ========================= */
  const [openCadastro, setOpenCadastro] = useState(isCadastroRoute);
  const [openCedentes, setOpenCedentes] = useState(
    pathname.startsWith("/dashboard/cedentes") ||
      pathname.startsWith("/dashboard/bloqueios")
  );
  const [openFuncionarios, setOpenFuncionarios] = useState(
    pathname.startsWith("/dashboard/funcionarios")
  );
  const [openClientes, setOpenClientes] = useState(
    pathname.startsWith("/dashboard/clientes")
  );

  const [openGestaoPontos, setOpenGestaoPontos] = useState(isGestaoPontosRoute);
  const [openPontosVisualizar, setOpenPontosVisualizar] =
    useState(isPontosVisualizarRoute);
  const [openCompras, setOpenCompras] = useState(isComprasRoute);
  const [openVendas, setOpenVendas] = useState(isVendasRoute);

  const [openLucros, setOpenLucros] = useState(isLucrosRoute);

  // ✅ Análise agora só Resumo
  const [openAnalise, setOpenAnalise] = useState(isAnaliseRoute);

  // ✅ Financeiro
  const [openFinanceiro, setOpenFinanceiro] = useState(isFinanceiroRoute);

  // ✅ Gestor de emissões
  const [openGestorEmissoes, setOpenGestorEmissoes] =
    useState(isGestorEmissoesRoute);

  // ✅ sub-accordion "Visualizar cedentes" dentro do Cadastro > Cedentes
  const isCadastroVisualizarCedentesRoute = pathname.startsWith(
    "/dashboard/cedentes/visualizar"
  );
  const [openCadastroVisualizarCedentes, setOpenCadastroVisualizarCedentes] =
    useState(isCadastroVisualizarCedentesRoute);

  // ✅ SubAccordion Comissões dentro de Lucros & Comissões
  const [openComissoes, setOpenComissoes] = useState(isComissoesSubRoute);

  useEffect(() => setOpenCadastro(isCadastroRoute), [isCadastroRoute]);
  useEffect(
    () => setOpenGestaoPontos(isGestaoPontosRoute),
    [isGestaoPontosRoute]
  );

  useEffect(
    () => setOpenPontosVisualizar(isPontosVisualizarRoute),
    [isPontosVisualizarRoute]
  );
  useEffect(() => setOpenCompras(isComprasRoute), [isComprasRoute]);
  useEffect(() => setOpenVendas(isVendasRoute), [isVendasRoute]);

  useEffect(() => {
    setOpenCadastroVisualizarCedentes(isCadastroVisualizarCedentesRoute);
  }, [isCadastroVisualizarCedentesRoute]);

  useEffect(() => setOpenLucros(isLucrosRoute), [isLucrosRoute]);

  // ✅ Análise só Resumo
  useEffect(() => setOpenAnalise(isAnaliseRoute), [isAnaliseRoute]);

  // ✅ Financeiro
  useEffect(() => setOpenFinanceiro(isFinanceiroRoute), [isFinanceiroRoute]);

  // ✅ Gestor de emissões
  useEffect(
    () => setOpenGestorEmissoes(isGestorEmissoesRoute),
    [isGestorEmissoesRoute]
  );

  useEffect(() => setOpenComissoes(isComissoesSubRoute), [isComissoesSubRoute]);

  /* =========================
   * FILTRO (VISUALIZAR PONTOS)
   * ========================= */
  const programa = (search?.get("programa") || "").toLowerCase();

  function pushWithPrograma(value: string | undefined) {
    const qs = new URLSearchParams(search?.toString() || "");
    if (!value) qs.delete("programa");
    else qs.set("programa", value);

    const q = qs.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  /* =========================
   * LOGOUT
   * ========================= */
  function doLogout() {
    signOut();
    router.replace("/login");
  }

  /* =========================
   * UI
   * ========================= */
  return (
    <aside className="w-64 h-screen border-r bg-white overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-3">
          <Image
            src="/trademiles.png"
            alt="TradeMiles"
            width={32}
            height={32}
          />
          <span className="font-semibold">TradeMiles</span>
        </div>
        {session && (
          <button
            onClick={doLogout}
            className="text-xs border px-2 py-1 rounded"
          >
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
        <Accordion
          title="Cadastro"
          open={openCadastro}
          onToggle={() => setOpenCadastro((v) => !v)}
          active={isCadastroRoute}
        >
          <SubAccordion
            title="Cedentes"
            open={openCedentes}
            onToggle={() => setOpenCedentes((v) => !v)}
          >
            <NavLink href="/dashboard/cedentes/importar">
              Importar cedentes
            </NavLink>
            <NavLink href="/dashboard/cedentes/novo">Cadastrar cedente</NavLink>

            <SubAccordion
              title="Visualizar cedentes"
              open={openCadastroVisualizarCedentes}
              onToggle={() => setOpenCadastroVisualizarCedentes((v) => !v)}
              variant="nav"
              active={isCadastroVisualizarCedentesRoute}
            >
              <NavLink
                href="/dashboard/cedentes/visualizar"
                className="font-semibold"
              >
                Todos
              </NavLink>
              <NavLink
                href="/dashboard/cedentes/visualizar?programa=latam"
                className="font-semibold"
              >
                Latam
              </NavLink>
              <NavLink
                href="/dashboard/cedentes/visualizar?programa=smiles"
                className="font-semibold"
              >
                Smiles
              </NavLink>
              <NavLink
                href="/dashboard/cedentes/visualizar?programa=livelo"
                className="font-semibold"
              >
                Livelo
              </NavLink>
              <NavLink
                href="/dashboard/cedentes/visualizar?programa=esfera"
                className="font-semibold"
              >
                Esfera
              </NavLink>
            </SubAccordion>

            <NavLink href="/dashboard/cedentes/pendentes">
              Cedentes pendentes
            </NavLink>

            <NavLink href="/dashboard/bloqueios">Contas bloqueadas</NavLink>
          </SubAccordion>

          <SubAccordion
            title="Funcionários"
            open={openFuncionarios}
            onToggle={() => setOpenFuncionarios((v) => !v)}
          >
            <NavLink href="/dashboard/funcionarios/novo">
              Cadastrar funcionário
            </NavLink>
            <NavLink href="/dashboard/funcionarios">
              Visualizar funcionários
            </NavLink>
          </SubAccordion>

          <SubAccordion
            title="Clientes"
            open={openClientes}
            onToggle={() => setOpenClientes((v) => !v)}
          >
            <NavLink href="/dashboard/clientes/novo">Cadastrar cliente</NavLink>
            <NavLink href="/dashboard/clientes">Visualizar clientes</NavLink>
          </SubAccordion>
        </Accordion>

        {/* ================= GESTÃO DE PONTOS ================= */}
        <Accordion
          title="Gestão de pontos"
          open={openGestaoPontos}
          onToggle={() => setOpenGestaoPontos((v) => !v)}
          active={isGestaoPontosRoute}
        >
          <SubAccordion
            title="Visualizar pontos"
            open={openPontosVisualizar}
            onToggle={() => setOpenPontosVisualizar((v) => !v)}
          >
            <NavLink href="/dashboard/cedentes/visualizar">Todos</NavLink>

            {isPontosVisualizarRoute ? (
              <div className="pl-2 pr-2 pb-1">
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => pushWithPrograma(undefined)}
                    className={cn(
                      "px-3 py-1 text-xs rounded-full border",
                      programa === ""
                        ? "bg-black text-white"
                        : "hover:bg-slate-100"
                    )}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => pushWithPrograma("latam")}
                    className={cn(
                      "px-3 py-1 text-xs rounded-full border",
                      programa === "latam"
                        ? "bg-black text-white"
                        : "hover:bg-slate-100"
                    )}
                  >
                    Latam
                  </button>
                  <button
                    type="button"
                    onClick={() => pushWithPrograma("smiles")}
                    className={cn(
                      "px-3 py-1 text-xs rounded-full border",
                      programa === "smiles"
                        ? "bg-black text-white"
                        : "hover:bg-slate-100"
                    )}
                  >
                    Smiles
                  </button>
                  <button
                    type="button"
                    onClick={() => pushWithPrograma("livelo")}
                    className={cn(
                      "px-3 py-1 text-xs rounded-full border",
                      programa === "livelo"
                        ? "bg-black text-white"
                        : "hover:bg-slate-100"
                    )}
                  >
                    Livelo
                  </button>
                  <button
                    type="button"
                    onClick={() => pushWithPrograma("esfera")}
                    className={cn(
                      "px-3 py-1 text-xs rounded-full border",
                      programa === "esfera"
                        ? "bg-black text-white"
                        : "hover:bg-slate-100"
                    )}
                  >
                    Esfera
                  </button>
                </div>
              </div>
            ) : (
              <>
                <NavLink href="/dashboard/cedentes/visualizar?programa=latam">
                  Latam
                </NavLink>
                <NavLink href="/dashboard/cedentes/visualizar?programa=smiles">
                  Smiles
                </NavLink>
                <NavLink href="/dashboard/cedentes/visualizar?programa=livelo">
                  Livelo
                </NavLink>
                <NavLink href="/dashboard/cedentes/visualizar?programa=esfera">
                  Esfera
                </NavLink>
              </>
            )}
          </SubAccordion>

          <SubAccordion
            title="Compras"
            open={openCompras}
            onToggle={() => setOpenCompras((v) => !v)}
          >
            <NavLink href="/dashboard/compras/nova">Efetuar compra</NavLink>
            <NavLink href="/dashboard/compras">Visualizar compras</NavLink>
          </SubAccordion>

          <SubAccordion
            title="Vendas"
            open={openVendas}
            onToggle={() => setOpenVendas((v) => !v)}
          >
            <NavLink href="/dashboard/vendas/nova">Efetuar venda</NavLink>
            <NavLink href="/dashboard/vendas">Painel de vendas</NavLink>
          </SubAccordion>
        </Accordion>

        {/* ================= LUCROS ================= */}
        <Accordion
          title="Lucros & Comissões"
          open={openLucros}
          onToggle={() => setOpenLucros((v) => !v)}
          active={isLucrosRoute}
        >
          <NavLink href="/dashboard/lucros">Lucros</NavLink>

          {/* ✅ Comissões vira submenu */}
          <SubAccordion
            title="Comissões"
            open={openComissoes}
            onToggle={() => setOpenComissoes((v) => !v)}
            variant="nav"
            active={pathname.startsWith("/dashboard/comissoes")}
          >
            <NavLink href="/dashboard/comissoes/cedentes">Cedentes</NavLink>
            <NavLink href="/dashboard/comissoes/funcionarios">
              Funcionários
            </NavLink>
          </SubAccordion>
        </Accordion>

        {/* ================= ANÁLISE ================= */}
        <Accordion
          title="Análise"
          open={openAnalise}
          onToggle={() => setOpenAnalise((v) => !v)}
          active={isAnaliseRoute}
        >
          <NavLink href="/dashboard/resumo">Resumo</NavLink>

          {/* REMOVIDOS da sidebar:
              - /dashboard/analise (Análise geral)
              - /dashboard/cpf (Contador CPF)
              - /dashboard/cpf/importar (Importar CPF)
              - /dashboard/dividas (Dívidas) -> agora em Financeiro
          */}
        </Accordion>

        {/* ================= FINANCEIRO ================= */}
        <Accordion
          title="Financeiro"
          open={openFinanceiro}
          onToggle={() => setOpenFinanceiro((v) => !v)}
          active={isFinanceiroRoute}
        >
          <NavLink href="/dashboard/dividas">Dívidas</NavLink>
          <NavLink href="/dashboard/recebimentos">Recebimentos</NavLink>
        </Accordion>

        {/* ================= GESTOR DE EMISSÕES ================= */}
        <Accordion
          title="Gestor de emissões"
          open={openGestorEmissoes}
          onToggle={() => setOpenGestorEmissoes((v) => !v)}
          active={isGestorEmissoesRoute}
        >
          <NavLink href="/dashboard/emissoes">Emissões por cedente</NavLink>
        </Accordion>
      </nav>
    </aside>
  );
}

/* =========================
 * COMPONENTES AUXILIARES
 * ========================= */
function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={cn(
        "block rounded-lg px-3 py-2 text-sm",
        active ? "bg-black text-white" : "hover:bg-slate-100",
        className
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
      {open && <div className="pl-2 space-y-1">{children}</div>}
    </>
  );
}

function SubAccordion({
  title,
  open,
  onToggle,
  children,
  variant = "default",
  active,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  variant?: "default" | "nav";
  active?: boolean;
}) {
  const isNav = variant === "nav";

  return (
    <>
      <button
        onClick={onToggle}
        className={cn(
          isNav
            ? cn(
                "w-full flex justify-between items-center rounded-lg px-3 py-2 text-sm",
                active ? "bg-black text-white" : "hover:bg-slate-100"
              )
            : "w-full flex justify-between items-center px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
        )}
      >
        <span>{title}</span>
        <span>{open ? (isNav ? "▾" : "−") : isNav ? "▸" : "+"}</span>
      </button>

      {open && (
        <div className={isNav ? "pl-4 space-y-1" : "pl-4 space-y-1"}>
          {children}
        </div>
      )}
    </>
  );
}
