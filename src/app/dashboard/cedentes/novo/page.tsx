'use client';
import { useEffect, useState } from "react";

type Cedente = {
  identificador: string;
  nome_completo: string;
  latam: number;
  esfera: number;
  livelo: number;
  smiles: number;
};

export default function CedentesNovo() {
  const [lista, setLista] = useState<Cedente[]>([]);
  const [nome, setNome] = useState("");
  const [latam, setLatam] = useState<number | "">("");
  const [esfera, setEsfera] = useState<number | "">("");
  const [livelo, setLivelo] = useState<number | "">("");
  const [smiles, setSmiles] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/cedentes");
    const json = await res.json();
    if (json.ok && json.data?.listaCedentes) {
      setLista(json.data.listaCedentes);
    } else {
      setLista([]);
    }
  }
  useEffect(() => { load(); }, []);

  function makeIdentifier(name: string, index: number) {
    const cleaned = name
      .normalize("NFD").replace(/\p{Diacritic}+/gu, "")
      .toUpperCase().replace(/[^\p{L}\p{N}\s']/gu, " ").trim();
    const base = (cleaned.split(/\s+/)[0] || "CED").replace(/[^A-Z0-9]/g, "");
    const prefix = (base.slice(0,3) || "CED").padEnd(3,"X");
    return `${prefix}-${String(index + 1).padStart(3,"0")}`;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { alert("Informe o nome completo"); return; }
    try {
      setSaving(true);
      const nextIndex = lista.length; // gera ID sequencial ao final da lista atual
      const novo: Cedente = {
        identificador: makeIdentifier(nome, nextIndex),
        nome_completo: nome.trim(),
        latam: Number(latam || 0),
        esfera: Number(esfera || 0),
        livelo: Number(livelo || 0),
        smiles: Number(smiles || 0),
      };
      const novaLista = [...lista, novo];

      const res = await fetch("/api/cedentes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listaCedentes: novaLista }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Falha ao salvar");

      setLista(novaLista);
      setNome(""); setLatam(""); setEsfera(""); setLivelo(""); setSmiles("");
      alert("Cedente inserido ✅");
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Inserir cedente</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Nome completo</label>
          <input
            className="w-full rounded-xl border px-3 py-2"
            value={nome}
            onChange={(e)=>setNome(e.target.value)}
            placeholder="Ex.: Maria Silva"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">Latam</label>
            <input
              type="number"
              className="w-full rounded-xl border px-3 py-2"
              value={latam}
              onChange={(e)=>setLatam(e.target.value === "" ? "" : Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Esfera</label>
            <input
              type="number"
              className="w-full rounded-xl border px-3 py-2"
              value={esfera}
              onChange={(e)=>setEsfera(e.target.value === "" ? "" : Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Livelo</label>
            <input
              type="number"
              className="w-full rounded-xl border px-3 py-2"
              value={livelo}
              onChange={(e)=>setLivelo(e.target.value === "" ? "" : Number(e.target.value))}
              min={0}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Smiles</label>
            <input
              type="number"
              className="w-full rounded-xl border px-3 py-2"
              value={smiles}
              onChange={(e)=>setSmiles(e.target.value === "" ? "" : Number(e.target.value))}
              min={0}
            />
          </div>
        </div>

        <button
          type="submit"
          className="rounded-xl bg-black px-4 py-2 text-white hover:bg-gray-800"
          disabled={saving}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </form>

      <div className="mt-8 text-sm text-slate-600">
        Total atual de cedentes: <b>{lista.length}</b>
      </div>
    </div>
  );
}
