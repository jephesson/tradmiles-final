"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { getSession, signOut } from "@/lib/auth";

const RATEIO_FLAG = "TM_RATEIO_OK";
const RATEIO_PWD = process.env.NEXT_PUBLIC_RATEIO_PWD?.trim() || "ufpb2010";

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

  const isLucrosRoute =
    pathname.startsWith("/dashboard/lucros") ||
    pathname.startsWith("/dashboard/resumo") ||
    pathname.startsWith("/dashboard/comissoes") ||
    pathname.startsWith("/dashboard/funcionarios/rateio");

  const isAnaliseRoute =
    pathname.startsWith("/dashboard/analise") ||
    pathname.startsWith("/dashboard/dividas") ||
    pathname.startsWith("/dashboard/cpf");

  /* =========================
   * ACCORDIONS
   * ========================= */
  const [openCadastro, setOpenCadastro] = useState(isCadastroRoute);
  const [openCedentes, setOpenCedentes] = useState(
    pathname.startsWith("/dashboard/cedentes")
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
  const [openAnalise, setOpenAnalise] = useState(isAnaliseRoute);

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
   * RATEIO
   * ========================= */
  function askRateioPasswordAndGo() {
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
            <NavLink href="/dashboard/cedentes/visualizar">
              Visualizar cedentes
            </NavLink>

            {/* ✅ Ajuste pedido: "Visualizar cedentes" como “rolamento” (SubAccordion) + itens em negrito */}
            <SubAccordion
              title="Visualizar cedentes"
              open={openPontosVisualizar}
              onToggle={() => setOpenPontosVisualizar((v) => !v)}
            >
              <NavLinkBold href="/dashboard/cedentes/visualizar">Todos</NavLinkBold>
              <NavLinkBold href="/dashboard/cedentes/visualizar?programa=latam">
                Latam
              </NavLinkBold>
              <NavLinkBold href="/dashboard/cedentes/visualizar?programa=smiles">
                Smiles
              </NavLinkBold>
              <NavLinkBold href="/dashboard/cedentes/visualizar?programa=livelo">
                Livelo
              </NavLinkBold>
              <NavLinkBold href="/dashboard/cedentes/visualizar?programa=esfera">
                Esfera
              </NavLinkBold>
            </SubAccordion>

            {/* ✅ Novo item: Pendentes */}
            <NavLink href="/dashboard/cedentes/pendentes">
              Cedentes pendentes
            </NavLink>
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
          {/* Visualizar pontos */}
          <SubAccordion
            title="Visualizar pontos"
            open={openPontosVisualizar}
            onToggle={() => setOpenPontosVisualizar((v) => !v)}
          >
            <NavLink href="/dashboard/cedentes/visualizar">Todos</NavLink>

            {/* botões de filtro */}
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

          {/* Compras */}
          <SubAccordion
            title="Compras"
            open={openCompras}
            onToggle={() => setOpenCompras((v) => !v)}
          >
            <NavLink href="/dashboard/compras/nova">Efetuar compra</NavLink>
            <NavLink href="/dashboard/compras">Visualizar compras</NavLink>
          </SubAccordion>

          {/* Vendas */}
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
          <NavLink href="/dashboard/resumo">Resumo</NavLink>
          <NavLink href="/dashboard/lucros">Lucros</NavLink>
          <NavLink href="/dashboard/comissoes">Comissões</NavLink>
          <NavLink href="/dashboard/funcionarios/rateio?view=1">
            Ver rateio
          </NavLink>
          <button
            onClick={askRateioPasswordAndGo}
            className="w-full text-left px-3 py-2 text-sm rounded hover:bg-slate-100"
          >
            Editar rateio (senha)
          </button>
        </Accordion>

        {/* ================= ANÁLISE ================= */}
        <Accordion
          title="Análise"
          open={openAnalise}
          onToggle={() => setOpenAnalise((v) => !v)}
          active={isAnaliseRoute}
        >
          <NavLink href="/dashboard/analise">Análise geral</NavLink>
          <NavLink href="/dashboard/cpf">Contador CPF</NavLink>
          <NavLink href="/dashboard/cpf/importar">Importar CPF</NavLink>
          <NavLink href="/dashboard/dividas">Dívidas</NavLink>
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
}: {
  href: string;
  children: React.ReactNode;
}) {
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

function NavLinkBold({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const active = pathname === href || pathname.startsWith(href + "/");

  // mantém o “active” coerente com o filtro por querystring
  const qs = search?.toString() || "";
  const isSameQuery = href.includes("?")
    ? qs === href.split("?")[1]
    : qs === "";

  const isActive = active && isSameQuery;

  return (
    <Link
      href={href}
      className={cn(
        "block rounded-lg px-3 py-2 text-sm font-bold",
        isActive ? "bg-black text-white" : "hover:bg-slate-100"
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
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        onClick={onToggle}
        className="w-full flex justify-between items-center px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded"
      >
        <span>{title}</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && <div className="pl-4 space-y-1">{children}</div>}
    </>
  );
}
