"use client";

import { useEffect, useMemo, useState } from "react";

type Cedente = {
  id: string;
  nomeCompleto: string;
};

export default function NovaCompraClient() {
  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [cedenteId, setCedenteId] = useState("");
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/cedentes/approved", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.data)) {
          setCedentes(j.data);
        }
      })
      .catch(console.error);
  }, []);

  // 🔤 ordena + filtra conforme digita
  const cedentesFiltrados = useMemo(() => {
    return cedentes
      .filter((c) =>
        c.nomeCompleto.toLowerCase().includes(busca.toLowerCase())
      )
      .sort((a, b) =>
        a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR")
      );
  }, [cedentes, busca]);

  async function criarCompra() {
    if (!cedenteId) {
      alert("Selecione um cedente");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedenteId }),
      });

      const j = await res.json();
      if (!j?.ok) throw new Error(j.error);

      window.location.href = `/dashboard/compras/${j.data.id}`;
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 max-w-md">
      <h1 className="text-2xl font-bold">Nova compra</h1>

      {/* 🔎 Busca */}
      <input
        className="border rounded-xl px-3 py-2 w-full"
        placeholder="Buscar cedente..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {/* 🔽 Select ordenado */}
      <select
        className="border rounded-xl px-3 py-2 w-full"
        value={cedenteId}
        onChange={(e) => setCedenteId(e.target.value)}
      >
        <option value="">Selecione o cedente</option>
        {cedentesFiltrados.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nomeCompleto}
          </option>
        ))}
      </select>

      <button
        onClick={criarCompra}
        disabled={loading}
        className="rounded-xl bg-black text-white px-4 py-2"
      >
        {loading ? "Criando..." : "Criar compra"}
      </button>
    </div>
  );
}
