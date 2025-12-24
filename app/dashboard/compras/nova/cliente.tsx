"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Programa = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Cedente = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;

  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;

  owner: { id: string; name: string; login: string };
  blockedPrograms?: Programa[];
};

function soDigitos(v?: string) {
  return (v || "").replace(/\D+/g, "");
}

function cpfFmt(cpf: string) {
  const d = soDigitos(cpf).slice(0, 11);
  if (d.length !== 11) return cpf || "-";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function ptsFmt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

export default function NovaCompra() {
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [busca, setBusca] = useState("");
  const [cedenteId, setCedenteId] = useState<string>("");

  const [criando, setCriando] = useState(false);

  // ✅ id técnico (cuid) pra URL
  const [compraId, setCompraId] = useState<string>("");

  // ✅ número humano já vem como string: "ID00001"
  const [compraNumero, setCompraNumero] = useState<string | null>(null);

  async function carregarCedentes() {
    setCarregando(true);
    try {
      const res = await fetch("/api/cedentes/approved", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "Falha ao carregar.");
      setCedentes(json.data || []);
    } catch (e: any) {
      alert(e?.message || "Erro ao carregar cedentes.");
      setCedentes([]);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarCedentes();
  }, []);

  const lista = useMemo(() => {
    const s = busca.trim().toLowerCase();
    if (!s) return cedentes;

    return cedentes.filter((c) => {
      return (
        c.nomeCompleto.toLowerCase().includes(s) ||
        c.identificador.toLowerCase().includes(s) ||
        String(c.cpf || "").includes(s) ||
        c.owner?.name?.toLowerCase().includes(s)
      );
    });
  }, [cedentes, busca]);

  const selecionado = useMemo(() => {
    return cedentes.find((c) => c.id === cedenteId) || null;
  }, [cedentes, cedenteId]);

  const podeCriar = !!selecionado && !compraId && !criando;

  async function criarCompra() {
    if (!selecionado) return;

    setCriando(true);
    try {
      const res = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedenteId: selecionado.id }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        alert(json?.error || "Não foi possível criar a compra.");
        return;
      }

      const id = json?.compra?.id as string | undefined;
      const numero = json?.compra?.numero as string | undefined; // ✅ string "ID00002"

      if (!id || !numero) {
        alert("Compra criada, mas não recebi ID/número.");
        return;
      }

      setCompraId(id);
      setCompraNumero(numero);
    } catch {
      alert("Erro de rede ao criar a compra.");
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nova compra</h1>
        <p className="text-sm text-slate-600">
          Selecione o cedente → confira os pontos → gere o ID da compra.
        </p>
      </div>

      {/* Buscar + listar */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-full sm:w-[420px] rounded-xl border px-3 py-2 text-sm"
            placeholder="Buscar (nome, CPF, identificador, responsável)..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          <button
            onClick={carregarCedentes}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            disabled={carregando}
          >
            Atualizar
          </button>

          <div className="text-xs text-slate-500">
            {carregando ? "Carregando..." : `${lista.length} resultado(s)`}
          </div>
        </div>

        <div className="mt-3 max-h-72 overflow-auto rounded-xl border">
          {!carregando && lista.length === 0 ? (
            <div className="p-3 text-sm text-slate-500">Nenhum cedente encontrado.</div>
          ) : (
            <ul className="divide-y">
              {lista.map((c) => {
                const ativo = c.id === cedenteId;
                const temBloqueio = (c.blockedPrograms || []).length > 0;

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCedenteId(c.id);

                        // ✅ se trocar cedente, zera compra criada
                        setCompraId("");
                        setCompraNumero(null);
                      }}
                      className={cn(
                        "w-full p-3 text-left hover:bg-slate-50",
                        ativo && "bg-slate-50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className={cn(
                              "truncate text-sm font-medium",
                              temBloqueio && "text-red-600"
                            )}
                          >
                            {c.nomeCompleto}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            {c.identificador} • {cpfFmt(c.cpf)} • Resp: {c.owner?.name}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {ativo ? "Selecionado" : "Selecionar"}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Prévia pontos */}
      <div className="rounded-2xl border bg-white p-4">
        <h2 className="text-sm font-semibold">Prévia de pontos</h2>

        {!selecionado ? (
          <div className="mt-3 text-sm text-slate-500">
            Selecione um cedente para ver os pontos.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Box titulo="LATAM" valor={ptsFmt(selecionado.pontosLatam)} />
            <Box titulo="SMILES" valor={ptsFmt(selecionado.pontosSmiles)} />
            <Box titulo="LIVELO" valor={ptsFmt(selecionado.pontosLivelo)} />
            <Box titulo="ESFERA" valor={ptsFmt(selecionado.pontosEsfera)} />

            <div className="col-span-2 rounded-xl border p-3">
              <div className="text-xs text-slate-500">Cedente</div>
              <div className="text-sm font-medium">{selecionado.nomeCompleto}</div>
              <div className="text-xs text-slate-500">
                {selecionado.identificador} • {cpfFmt(selecionado.cpf)} • Resp:{" "}
                {selecionado.owner?.name}
              </div>

              {(selecionado.blockedPrograms || []).length > 0 && (
                <div className="mt-2 text-xs text-red-600">
                  Atenção: bloqueios em {selecionado.blockedPrograms?.join(", ")}.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Criar compra */}
      <div className="rounded-2xl border bg-white p-4">
        <h2 className="text-sm font-semibold">Gerar ID da compra</h2>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={criarCompra}
            disabled={!podeCriar}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium",
              podeCriar
                ? "bg-black text-white"
                : "bg-slate-200 text-slate-500 cursor-not-allowed"
            )}
          >
            {criando ? "Criando..." : "Criar compra"}
          </button>

          {compraId && compraNumero && (
            <>
              <div className="rounded-xl border px-3 py-2 text-sm">
                <span className="text-slate-500">ID: </span>
                <span className="font-semibold">{compraNumero}</span>
              </div>

              <Link
                href={`/dashboard/compras/${compraId}`}
                className="rounded-xl border px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Ir para compra →
              </Link>
            </>
          )}
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Agora o ID exibido é sequencial (ID00001, ID00002...). A URL usa o id técnico.
        </p>
      </div>
    </div>
  );
}

function Box({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className="text-lg font-semibold">{valor}</div>
    </div>
  );
}
