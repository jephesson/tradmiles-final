"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type Status = "DRAFT" | "SENT" | "WAITING" | "RESOLVED" | "DENIED";

type CedenteLite = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
};

type ProtocolRow = {
  id: string;
  program: Program;
  status: Status;
  title: string | null;
  complaint: string;
  response: string | null;
  createdAt: string;
  updatedAt: string;
};

function statusLabel(s: Status) {
  switch (s) {
    case "DRAFT":
      return "Rascunho";
    case "SENT":
      return "Enviado";
    case "WAITING":
      return "Aguardando";
    case "RESOLVED":
      return "Resolvido";
    case "DENIED":
      return "Negado";
  }
}

export default function ProtocolosProgramClient({ program }: { program: Program }) {
  const [cedentes, setCedentes] = useState<CedenteLite[]>([]);
  const [cedenteId, setCedenteId] = useState<string>("");

  const [rows, setRows] = useState<ProtocolRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId]
  );

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Status>("DRAFT");
  const [complaint, setComplaint] = useState("");
  const [response, setResponse] = useState("");

  const [loadingCed, setLoadingCed] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadCedentes() {
    setLoadingCed(true);
    setErr(null);
    try {
      const res = await fetch("/api/cedentes/lite", { cache: "no-store" });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao carregar cedentes");
      setCedentes(j.rows || []);
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar cedentes");
    } finally {
      setLoadingCed(false);
    }
  }

  async function loadProtocols(cId: string) {
    if (!cId) return;
    setLoadingRows(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/protocolos?program=${encodeURIComponent(program)}&cedenteId=${encodeURIComponent(cId)}`,
        { cache: "no-store" }
      );
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao carregar protocolos");
      const list: ProtocolRow[] = j.rows || [];
      setRows(list);
      setSelectedId(list[0]?.id || "");
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar protocolos");
      setRows([]);
      setSelectedId("");
    } finally {
      setLoadingRows(false);
    }
  }

  async function createProtocol() {
    if (!cedenteId) return;
    setErr(null);
    try {
      const res = await fetch("/api/protocolos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program,
          cedenteId,
          title: `Protocolo ${program}`,
        }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao criar protocolo");
      await loadProtocols(cedenteId);
      // seleciona o recém-criado (ele vai vir no topo se createdAt for agora)
      setSelectedId(j.row?.id || "");
    } catch (e: any) {
      setErr(e?.message || "Erro ao criar protocolo");
    }
  }

  async function saveProtocol() {
    if (!selectedId) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/protocolos/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || null,
          status,
          complaint,
          response: response || null,
        }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Falha ao salvar");
      await loadProtocols(cedenteId);
      setSelectedId(j.row?.id || selectedId);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar protocolo");
    } finally {
      setSaving(false);
    }
  }

  // init
  useEffect(() => {
    loadCedentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // quando seleciona cedente, carrega protocolos
  useEffect(() => {
    if (cedenteId) loadProtocols(cedenteId);
    else {
      setRows([]);
      setSelectedId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cedenteId, program]);

  // quando muda protocolo selecionado, joga pro form
  useEffect(() => {
    if (!selected) {
      setTitle("");
      setStatus("DRAFT");
      setComplaint("");
      setResponse("");
      return;
    }
    setTitle(selected.title || "");
    setStatus(selected.status);
    setComplaint(selected.complaint || "");
    setResponse(selected.response || "");
  }, [selected]);

  const cedenteSelected = useMemo(
    () => cedentes.find((c) => c.id === cedenteId) || null,
    [cedentes, cedenteId]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Protocolos — {program}</h1>
          <p className="text-sm text-slate-600">
            Selecione o cedente, crie/abra um protocolo, descreva a reclamação, marque o status e registre a resposta da CIA.
          </p>
        </div>

        <button
          type="button"
          onClick={createProtocol}
          disabled={!cedenteId}
          className={cn(
            "border rounded px-3 py-2 text-sm",
            !cedenteId ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"
          )}
        >
          Novo protocolo
        </button>
      </div>

      {err && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3 text-sm">
          {err}
        </div>
      )}

      <div className="border rounded p-3">
        <div className="text-sm font-medium mb-2">Selecionar cedente</div>

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={cedenteId}
            onChange={(e) => setCedenteId(e.target.value)}
            className="border rounded px-3 py-2 text-sm w-full"
            disabled={loadingCed}
          >
            <option value="">{loadingCed ? "Carregando..." : "Selecione..."}</option>
            {cedentes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nomeCompleto} — {c.identificador}
              </option>
            ))}
          </select>

          <div className="text-xs text-slate-600 flex items-center">
            {cedenteSelected ? (
              <span>
                CPF: {cedenteSelected.cpf} • ID: {cedenteSelected.identificador}
              </span>
            ) : (
              <span> </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LISTA */}
        <div className="lg:col-span-4 border rounded">
          <div className="border-b px-3 py-2 text-sm font-medium">
            Protocolos {loadingRows ? "(carregando...)" : `(${rows.length})`}
          </div>

          <div className="max-h-[520px] overflow-auto">
            {rows.length === 0 ? (
              <div className="p-3 text-sm text-slate-600">
                {cedenteId ? "Nenhum protocolo ainda. Clique em “Novo protocolo”." : "Selecione um cedente."}
              </div>
            ) : (
              rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 border-b hover:bg-slate-50",
                    selectedId === r.id && "bg-black text-white hover:bg-black"
                  )}
                >
                  <div className="text-sm font-medium">
                    {r.title?.trim() ? r.title : "Sem título"}
                  </div>
                  <div className={cn("text-xs", selectedId === r.id ? "text-white/80" : "text-slate-600")}>
                    {statusLabel(r.status)} • {new Date(r.createdAt).toLocaleString("pt-BR")}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* EDITOR */}
        <div className="lg:col-span-8 border rounded">
          <div className="border-b px-3 py-2 flex items-center justify-between">
            <div className="text-sm font-medium">Editor do protocolo</div>

            <button
              type="button"
              onClick={saveProtocol}
              disabled={!selectedId || saving}
              className={cn(
                "border rounded px-3 py-1.5 text-sm",
                !selectedId || saving ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"
              )}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>

          {!selectedId ? (
            <div className="p-3 text-sm text-slate-600">Selecione um protocolo na lista.</div>
          ) : (
            <div className="p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-8">
                  <label className="text-xs text-slate-600">Título</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border rounded px-3 py-2 text-sm w-full"
                    placeholder="Ex: Estorno de pontos debitados sem emissão"
                  />
                </div>

                <div className="md:col-span-4">
                  <label className="text-xs text-slate-600">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Status)}
                    className="border rounded px-3 py-2 text-sm w-full"
                  >
                    <option value="DRAFT">Rascunho</option>
                    <option value="SENT">Enviado</option>
                    <option value="WAITING">Aguardando</option>
                    <option value="RESOLVED">Resolvido</option>
                    <option value="DENIED">Negado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-600">Reclamação (texto grande)</label>
                <textarea
                  value={complaint}
                  onChange={(e) => setComplaint(e.target.value)}
                  className="border rounded px-3 py-2 text-sm w-full min-h-[220px]"
                  placeholder="Cole aqui a reclamação completa..."
                />
              </div>

              <div>
                <label className="text-xs text-slate-600">Resposta da CIA</label>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  className="border rounded px-3 py-2 text-sm w-full min-h-[180px]"
                  placeholder="Cole aqui a resposta da CIA..."
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
