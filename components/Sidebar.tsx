"use client";

import Link from "next/link";
import Image from "next/image";
import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { getSession, signOut } from "@/lib/auth";

const STRICT_NOQUERY_ACTIVE_PATHS = new Set<string>([
  "/dashboard/cedentes/visualizar",
  "/dashboard/emissoes",
  "/dashboard/painel-emissoes",
  "/dashboard/clubes",
]);

const VISUALIZAR_PONTOS_PATH = "/dashboard/cedentes/visualizar";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const session = getSession();

  /* =========================
   * ROTAS
   * ========================= */

  const isPontosVisualizarRoute = pathname.startsWith(VISUALIZAR_PONTOS_PATH);

  // ✅ Cadastro NÃO deve “pegar” Visualizar cedentes
  const isCadastroRoute =
    (pathname.startsWith("/dashboard/cedentes") && !isPontosVisualizarRoute) ||
    pathname.startsWith("/dashboard/clientes") ||
    pathname.startsWith("/dashboard/funcionarios") ||
    pathname.startsWith("/dashboard/bloqueios");

  const isComprasRoute = pathname.startsWith("/dashboard/compras");
  const isVendasRoute = pathname.startsWith("/dashboard/vendas");

  const isClubesRoute = pathname.startsWith("/dashboard/clubes");

  // ✅ Gestão de pontos engloba Visualizar, Compras, Vendas e Clubes
  const isGestaoPontosRoute =
    isPontosVisualizarRoute || isComprasRoute || isVendasRoute || isClubesRoute;

  // ✅ Lucros/Comissões
  const isLucrosRoute =
    pathname.startsWith("/dashboard/lucros") ||
    pathname.startsWith("/dashboard/comissoes");

  // ✅ RESUMO (link mantém /dashboard/resumo)
  const isResumoRoute = pathname.startsWith("/dashboard/resumo");

  // ✅ ANÁLISE & ESTRATÉGIA (novas rotas)
  const isEstrategiaCompraRoute = pathname.startsWith(
    "/dashboard/estrategia-compra"
  );
  const isContasSelecionadasRoute = pathname.startsWith(
    "/dashboard/contas-selecionadas"
  );
  const isAnaliseRoute = isEstrategiaCompraRoute || isContasSelecionadasRoute;

  // ✅ FINANCEIRO (agora inclui Resumo)
  const isDividasRoute = pathname.startsWith("/dashboard/dividas");
  const isRecebimentosRoute = pathname.startsWith("/dashboard/recebimentos");
  const isImpostosRoute = pathname.startsWith("/dashboard/impostos");
  const isFinanceiroRoute =
    isDividasRoute || isRecebimentosRoute || isImpostosRoute || isResumoRoute;

  // ✅ IMPORTAÇÕES (fora do Gestor de emissões)
  const isImportacoesRoute = pathname.startsWith("/dashboard/importacoes");
  const isImportacoesEmissoesLatamRoute = pathname.startsWith(
    "/dashboard/emissoes/import-latam"
  );
  const isImportacoesEmissoesSubRoute = isImportacoesEmissoesLatamRoute;

  // ✅ Painel de Emissões (novo)
  const isPainelEmissoesRoute = pathname.startsWith(
    "/dashboard/painel-emissoes"
  );

  // ✅ GESTOR DE EMISSÕES (exclui importação)
  const isEmissoesRoute =
    pathname.startsWith("/dashboard/emissoes") &&
    !isImportacoesEmissoesLatamRoute;

  const isGestorEmissoesRoute = isEmissoesRoute || isPainelEmissoesRoute;

  // ✅ Rotas de comissões (subitens)
  const isComissoesCedentesRoute = pathname.startsWith(
    "/dashboard/comissoes/cedentes"
  );
  const isComissoesFuncionariosRoute = pathname.startsWith(
    "/dashboard/comissoes/funcionarios"
  );
  const isComissoesSubRoute =
    isComissoesCedentesRoute || isComissoesFuncionariosRoute;

  // ✅ Rotas / queries do submenu "Emissões por cedente"
  const isEmissoesBasePath = pathname === "/dashboard/emissoes";
  const programaEmissoes = (search?.get("programa") || "").toLowerCase();
  const isEmissoesUltimas = isEmissoesBasePath && programaEmissoes === "";
  const isEmissoesLatam = isEmissoesBasePath && programaEmissoes === "latam";
  const isEmissoesSmiles = isEmissoesBasePath && programaEmissoes === "smiles";

  // ✅ Rotas / queries do submenu "Painel de Emissões"
  const isPainelBasePath = pathname === "/dashboard/painel-emissoes";
  const programaPainel = (search?.get("programa") || "").toLowerCase();
  const isPainelLatam =
    isPainelBasePath && (programaPainel === "" || programaPainel === "latam");

  /* =========================
   * ACCORDIONS
   * ========================= */
  const [openCadastro, setOpenCadastro] = useState(isCadastroRoute);

  const [openCedentes, setOpenCedentes] = useState(
    (pathname.startsWith("/dashboard/cedentes") && !isPontosVisualizarRoute) ||
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

  const [openClubes, setOpenClubes] = useState(isClubesRoute);

  const [openCompras, setOpenCompras] = useState(isComprasRoute);
  const [openVendas, setOpenVendas] = useState(isVendasRoute);

  const [openLucros, setOpenLucros] = useState(isLucrosRoute);

  const [openAnalise, setOpenAnalise] = useState(isAnaliseRoute);

  const [openFinanceiro, setOpenFinanceiro] = useState(isFinanceiroRoute);

  const [openGestorEmissoes, setOpenGestorEmissoes] =
    useState(isGestorEmissoesRoute);

  const [openImportacoes, setOpenImportacoes] = useState(
    isImportacoesRoute || isImportacoesEmissoesLatamRoute
  );
  const [openImportacoesEmissoes, setOpenImportacoesEmissoes] = useState(
    isImportacoesEmissoesSubRoute
  );

  const [openComissoes, setOpenComissoes] = useState(isComissoesSubRoute);

  const [openEmissoesPorCedente, setOpenEmissoesPorCedente] = useState(
    isEmissoesRoute
  );

  const [openPainelEmissoes, setOpenPainelEmissoes] = useState(
    isPainelEmissoesRoute
  );

  useEffect(() => setOpenCadastro(isCadastroRoute), [isCadastroRoute]);

  useEffect(() => {
    setOpenCedentes(
      (pathname.startsWith("/dashboard/cedentes") && !isPontosVisualizarRoute) ||
        pathname.startsWith("/dashboard/bloqueios")
    );
  }, [pathname, isPontosVisualizarRoute]);

  useEffect(() => {
    setOpenFuncionarios(pathname.startsWith("/dashboard/funcionarios"));
  }, [pathname]);

  useEffect(() => {
    setOpenClientes(pathname.startsWith("/dashboard/clientes"));
  }, [pathname]);

  useEffect(
    () => setOpenGestaoPontos(isGestaoPontosRoute),
    [isGestaoPontosRoute]
  );
  useEffect(
    () => setOpenPontosVisualizar(isPontosVisualizarRoute),
    [isPontosVisualizarRoute]
  );

  useEffect(() => setOpenClubes(isClubesRoute), [isClubesRoute]);

  useEffect(() => setOpenCompras(isComprasRoute), [isComprasRoute]);
  useEffect(() => setOpenVendas(isVendasRoute), [isVendasRoute]);

  useEffect(() => setOpenLucros(isLucrosRoute), [isLucrosRoute]);

  useEffect(() => setOpenAnalise(isAnaliseRoute), [isAnaliseRoute]);

  useEffect(() => setOpenFinanceiro(isFinanceiroRoute), [isFinanceiroRoute]);

  useEffect(
    () => setOpenGestorEmissoes(isGestorEmissoesRoute),
    [isGestorEmissoesRoute]
  );

  useEffect(() => {
    setOpenImportacoes(isImportacoesRoute || isImportacoesEmissoesLatamRoute);
  }, [isImportacoesRoute, isImportacoesEmissoesLatamRoute]);

  useEffect(() => {
    setOpenImportacoesEmissoes(isImportacoesEmissoesSubRoute);
  }, [isImportacoesEmissoesSubRoute]);

  useEffect(() => setOpenComissoes(isComissoesSubRoute), [isComissoesSubRoute]);

  useEffect(() => {
    setOpenEmissoesPorCedente(isEmissoesRoute);
  }, [isEmissoesRoute]);

  useEffect(() => {
    setOpenPainelEmissoes(isPainelEmissoesRoute);
  }, [isPainelEmissoesRoute]);

  /* =========================
   * FILTRO (VISUALIZAR PONTOS)
   * ========================= */

  // ✅ só marca ativo quando estiver na tela de visualizar
  const programa = isPontosVisualizarRoute
    ? (search?.get("programa") || "").toLowerCase()
    : "";

  // ✅ navega SEMPRE pra página de visualizar (resolve o problema dos botões fora da rota)
  function goVisualizarPrograma(value: string | undefined) {
    const qs = new URLSearchParams(
      isPontosVisualizarRoute ? search?.toString() || "" : ""
    );

    if (!value) qs.delete("programa");
    else qs.set("programa", value);

    const q = qs.toString();
    router.push(q ? `${VISUALIZAR_PONTOS_PATH}?${q}` : VISUALIZAR_PONTOS_PATH);
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

            <NavLink href="/dashboard/funcionarios" exact>
              Visualizar funcionários
            </NavLink>

            <NavLink href="/dashboard/funcionarios/rateio">
              Rateio do lucro
            </NavLink>
          </SubAccordion>

          <SubAccordion
            title="Clientes"
            open={openClientes}
            onToggle={() => setOpenClientes((v) => !v)}
          >
            <NavLink href="/dashboard/clientes/novo">Cadastrar cliente</NavLink>

            <NavLink href="/dashboard/clientes" exact>
              Visualizar clientes
            </NavLink>
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
            {/* ✅ APENAS OS RETÂNGULOS (sem NavLink duplicado) */}
            <div className="pl-2 pr-2 pb-1">
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => goVisualizarPrograma(undefined)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full border",
                    programa === "" ? "bg-black text-white" : "hover:bg-slate-100"
                  )}
                >
                  Todos
                </button>

                <button
                  type="button"
                  onClick={() => goVisualizarPrograma("latam")}
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
                  onClick={() => goVisualizarPrograma("smiles")}
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
                  onClick={() => goVisualizarPrograma("livelo")}
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
                  onClick={() => goVisualizarPrograma("esfera")}
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
          </SubAccordion>

          <SubAccordion
            title="Clube"
            open={openClubes}
            onToggle={() => setOpenClubes((v) => !v)}
          >
            <NavLink href="/dashboard/clubes/cadastrar" exact>
              Cadastrar clube
            </NavLink>

            <NavLink href="/dashboard/clubes" exact>
              Lista
            </NavLink>
          </SubAccordion>

          <SubAccordion
            title="Compras"
            open={openCompras}
            onToggle={() => setOpenCompras((v) => !v)}
          >
            <NavLink href="/dashboard/compras/nova">Efetuar compra</NavLink>
            <NavLink href="/dashboard/compras" exact>
              Visualizar compras
            </NavLink>
          </SubAccordion>

          <SubAccordion
            title="Vendas"
            open={openVendas}
            onToggle={() => setOpenVendas((v) => !v)}
          >
            <NavLink href="/dashboard/vendas/nova">Efetuar venda</NavLink>

            <NavLink href="/dashboard/vendas" exact>
              Painel de vendas
            </NavLink>

            <NavLink href="/dashboard/vendas/compras-a-finalizar">
              Compras a finalizar
            </NavLink>
            <NavLink href="/dashboard/vendas/compras-finalizadas">
              Compras finalizadas
            </NavLink>
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
          title="Análise & Estratégia"
          open={openAnalise}
          onToggle={() => setOpenAnalise((v) => !v)}
          active={isAnaliseRoute}
        >
          <NavLink href="/dashboard/estrategia-compra">
            Estratégia de compra
          </NavLink>
          <NavLink href="/dashboard/contas-selecionadas">
            Contas selecionadas
          </NavLink>
        </Accordion>

        {/* ================= FINANCEIRO ================= */}
        <Accordion
          title="Financeiro"
          open={openFinanceiro}
          onToggle={() => setOpenFinanceiro((v) => !v)}
          active={isFinanceiroRoute}
        >
          {/* ✅ Resumo veio pra cá (sem mudar link) */}
          <NavLink href="/dashboard/resumo">Resumo</NavLink>

          <NavLink href="/dashboard/dividas">Dívidas</NavLink>
          <NavLink href="/dashboard/recebimentos">Recebimentos</NavLink>
          <NavLink href="/dashboard/impostos">Impostos</NavLink>
        </Accordion>

        {/* ================= IMPORTAÇÕES (FORA DO GESTOR) ================= */}
        <Accordion
          title="Importações"
          open={openImportacoes}
          onToggle={() => setOpenImportacoes((v) => !v)}
          active={isImportacoesRoute || isImportacoesEmissoesLatamRoute}
        >
          <SubAccordion
            title="Emissões"
            open={openImportacoesEmissoes}
            onToggle={() => setOpenImportacoesEmissoes((v) => !v)}
            variant="nav"
            active={isImportacoesEmissoesLatamRoute}
          >
            <NavLink
              href="/dashboard/emissoes/import-latam"
              className="font-semibold"
            >
              Latam
            </NavLink>
          </SubAccordion>
        </Accordion>

        {/* ================= GESTOR DE EMISSÕES ================= */}
        <Accordion
          title="Gestor de emissões"
          open={openGestorEmissoes}
          onToggle={() => setOpenGestorEmissoes((v) => !v)}
          active={isGestorEmissoesRoute}
        >
          <SubAccordion
            title="Emissões por cedente"
            open={openEmissoesPorCedente}
            onToggle={() => setOpenEmissoesPorCedente((v) => !v)}
            variant="nav"
            active={isEmissoesRoute}
          >
            <NavLink href="/dashboard/emissoes" className="font-semibold">
              Últimas emissões
            </NavLink>
            <NavLink
              href="/dashboard/emissoes?programa=latam"
              className="font-semibold"
            >
              Latam
            </NavLink>
            <NavLink
              href="/dashboard/emissoes?programa=smiles"
              className="font-semibold"
            >
              Smiles
            </NavLink>
          </SubAccordion>

          <SubAccordion
            title="Painel de Emissões"
            open={openPainelEmissoes}
            onToggle={() => setOpenPainelEmissoes((v) => !v)}
            variant="nav"
            active={isPainelEmissoesRoute}
          >
            <NavLink
              href="/dashboard/painel-emissoes?programa=latam"
              className={cn(
                "font-semibold",
                isPainelLatam && "bg-black text-white"
              )}
            >
              Latam
            </NavLink>
          </SubAccordion>
        </Accordion>
      </nav>
    </aside>
  );
}

/* =========================
 * COMPONENTES AUXILIARES
 * ========================= */

function paramsEqual(
  current: ReadonlyURLSearchParams | null,
  hrefQuery: string
) {
  const a = new URLSearchParams(current?.toString() || "");
  const b = new URLSearchParams(hrefQuery || "");

  const aEntries = Array.from(a.entries()).sort();
  const bEntries = Array.from(b.entries()).sort();
  if (aEntries.length !== bEntries.length) return false;

  for (let i = 0; i < aEntries.length; i++) {
    if (aEntries[i][0] !== bEntries[i][0]) return false;
    if (aEntries[i][1] !== bEntries[i][1]) return false;
  }
  return true;
}

function NavLink({
  href,
  children,
  className,
  exact = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const search = useSearchParams();

  const [hrefPath, hrefQuery = ""] = href.split("?");
  const hasQuery = href.includes("?");
  const currentQuery = search?.toString() || "";

  const active = hasQuery
    ? pathname === hrefPath && paramsEqual(search, hrefQuery)
    : exact
    ? pathname === hrefPath
    : !(
        STRICT_NOQUERY_ACTIVE_PATHS.has(hrefPath) &&
        pathname === hrefPath &&
        currentQuery
      ) && (pathname === href || pathname.startsWith(href + "/"));

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
  children: ReactNode;
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
  href,
  open,
  onToggle,
  children,
  variant = "default",
  active,
}: {
  title: string;
  href?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  variant?: "default" | "nav";
  active?: boolean;
}) {
  const isNav = variant === "nav";

  const rowClass = cn(
    isNav
      ? cn(
          "w-full flex justify-between items-center rounded-lg px-3 py-2 text-sm",
          active ? "bg-black text-white" : "hover:bg-slate-100"
        )
      : "w-full flex justify-between items-center px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
  );

  if (href) {
    return (
      <>
        <div className={rowClass}>
          <Link href={href} className="flex-1 text-left">
            {title}
          </Link>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }}
            className={cn(
              "ml-2 rounded px-2 py-1",
              isNav && active ? "hover:bg-white/10" : "hover:bg-slate-200"
            )}
            aria-label={open ? `Fechar ${title}` : `Abrir ${title}`}
          >
            {open ? (isNav ? "▾" : "−") : isNav ? "▸" : "+"}
          </button>
        </div>

        {open && <div className="pl-4 space-y-1">{children}</div>}
      </>
    );
  }

  return (
    <>
      <button onClick={onToggle} className={rowClass}>
        <span>{title}</span>
        <span>{open ? (isNav ? "▾" : "−") : isNav ? "▸" : "+"}</span>
      </button>

      {open && <div className="pl-4 space-y-1">{children}</div>}
    </>
  );
}
