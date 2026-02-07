"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Owner = { id: string; name: string; login: string };

type CedenteRow = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  owner: Owner;

  wallet: number; // cents
  walletUpdatedAt: string | null;
};

function formatBRL(cents: number) {
  const v = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

function parseBRLToCents(input: string) {
  // aceita: "1234", "1.234,56", "R$ 1.234,56"
  const s = String(input || "")
    .replace(/[^\d,]/g, "") // deixa dígitos e vírgula
    .trim();

  if (!s) return 0;

  const parts = s.split(",");
  const intPart = (parts[0] || "").replace(/\D/g, "");
  const decPartRaw = (parts[1] || "").replace(/\D/g, "");

  const decPart = (decPartRaw + "00").slice(0, 2); // 2 casas
  const full = `${intPart}${decPart}`.replace(/^0+/, "") || "0";
  return Number(full);
}

export default function WalletLatamClient() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CedenteRow[]>([]);
  const [totalCents, setTotalCents] = useState(0);

  // dropdown pesquisável
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [amountText, setAmountText] = useState<string>("");

  const dropdownRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/wallet/latam", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao carregar.");
      setRows(j.rows || []);
      setTotalCents(j.totalCents || 0);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Erro ao carregar wallet.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // fechar dropdown clicando fora
  useEffect(() => {
    function onDocClick(ev: MouseEvent) {
      if (!open) return;
      const el = dropdownRef.current;
      if (!el) return;
      if (ev.target instanceof Node && !el.contains(ev.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.nomeCompleto} ${r.identificador} ${r.cpf}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  async function save() {
    if (!selectedId) return;
    const cents = parseBRLToCents(amountText);
    try {
      const r = await fetch("/api/wallet/latam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedenteId: selectedId, amountCents: cents }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao salvar.");

      // atualiza rows localmente
      setRows((prev) =>
        prev.map((x) =>
          x.id === selectedId
            ? {
                ...x,
                wallet: j.saved.amountCents,
                walletUpdatedAt: j.saved.updatedAt,
              }
            : x
        )
      );
      setTotalCents(j.totalCents || 0);

      // deixa input bonitinho
      setAmountText(formatBRL(cents));
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Erro ao salvar.");
    }
  }

  function pickCedente(id: string) {
    setSelectedId(id);
    const r = rows.find((x) => x.id === id);
    setAmountText(r ? formatBRL(r.wallet || 0) : "");
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="space-y-4">
      {/* Total */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">Total na wallet (LATAM)</div>
        <div className="mt-1 text-2xl font-semibold">{formatBRL(totalCents)}</div>
      </div>

      {/* Form */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          {/* Dropdown */}
          <div className="md:col-span-2" ref={dropdownRef}>
            <label className="text-sm font-medium">Cedente LATAM</label>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={cn(
                "mt-1 w-full rounded-xl border px-3 py-2 text-left",
                "hover:bg-muted/30"
              )}
            >
              {selected ? (
                <div className="flex flex-col">
                  <span className="font-medium">{selected.nomeCompleto}</span>
                  <span className="text-xs text-muted-foreground">
                    {selected.identificador} • CPF {selected.cpf}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">
                  Clique para selecionar e pesquisar…
                </span>
              )}
            </button>

            {open && (
              <div className="mt-2 rounded-xl border bg-white shadow-lg">
                <div className="p-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Pesquisar por nome, identificador ou CPF…"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    autoFocus
                  />
                </div>
                <div className="max-h-72 overflow-auto p-1">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Nenhum cedente encontrado.
                    </div>
                  ) : (
                    filtered.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => pickCedente(r.id)}
                        className={cn(
                          "w-full rounded-lg px-3 py-2 text-left text-sm",
                          "hover:bg-muted/40"
                        )}
                      >
                        <div className="font-medium">{r.nomeCompleto}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.identificador} • CPF {r.cpf} • Wallet:{" "}
                          {formatBRL(r.wallet || 0)}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Valor */}
          <div>
            <label className="text-sm font-medium">Valor (R$)</label>
            <input
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              placeholder="Ex: 1.234,56"
              className="mt-1 w-full rounded-xl border px-3 py-2"
            />
            <button
              type="button"
              onClick={save}
              disabled={!selectedId || loading}
              className={cn(
                "mt-2 w-full rounded-xl px-3 py-2 font-medium",
                !selectedId || loading
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-black text-white hover:opacity-90"
              )}
            >
              Salvar
            </button>
          </div>
        </div>
      </div>

      {/* Listagem */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Cedentes LATAM</div>
            <div className="text-xs text-muted-foreground">
              {rows.length} cedentes
            </div>
          </div>

          <button
            type="button"
            onClick={load}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-muted/30"
          >
            Atualizar
          </button>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2">Cedente</th>
                <th className="py-2">Identificador</th>
                <th className="py-2">CPF</th>
                <th className="py-2 text-right">Wallet (R$)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="py-2">
                    <div className="font-medium">{r.nomeCompleto}</div>
                    <div className="text-xs text-muted-foreground">
                      Owner: {r.owner?.name || r.owner?.login || "-"}
                    </div>
                  </td>
                  <td className="py-2">{r.identificador}</td>
                  <td className="py-2">{r.cpf}</td>
                  <td className="py-2 text-right font-medium">
                    {formatBRL(r.wallet || 0)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td className="py-6 text-center text-muted-foreground" colSpan={4}>
                    Nenhum cedente LATAM encontrado (pela regra atual).
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td className="py-6 text-center text-muted-foreground" colSpan={4}>
                    Carregando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
