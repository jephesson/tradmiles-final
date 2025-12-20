"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

type ImportedCedente = {
  nomeCompleto: string;
  cpf?: string;
  telefone?: string;
  dataNascimento?: string;
  email?: string;
  senhaLatam?: string;
  senhaSmiles?: string;
  senhaLivelo?: string;
  senhaEsfera?: string;
  responsavelRef?: string;
};

export default function CedentesImporter() {
  const [rows, setRows] = useState<ImportedCedente[]>([]);
  const [loading, setLoading] = useState(false);

  function normalize(v?: string) {
    return (v || "").trim();
  }

  function parseExcel(file: File) {
    const reader = new FileReader();

    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });

      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

      const parsed: ImportedCedente[] = json.map((r) => ({
        nomeCompleto: normalize(r["Nome"] || r["nome"]),
        cpf: normalize(r["CPF"]),
        telefone: normalize(r["Telefone"]),
        dataNascimento: normalize(r["Nascimento"]),
        email: normalize(r["Email"]),
        senhaLatam: normalize(r["Senha Latam"]),
        senhaSmiles: normalize(r["Senha Smiles"]),
        senhaLivelo: normalize(r["Senha Livelo"]),
        senhaEsfera: normalize(r["Senha Esfera"]),
        responsavelRef: normalize(r["Responsável"]),
      }));

      setRows(parsed.filter((r) => r.nomeCompleto));
    };

    reader.readAsArrayBuffer(file);
  }

  async function importar() {
    if (!rows.length) {
      alert("Nada para importar.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/cedentes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const json = await res.json();

      if (!json.ok) throw new Error(json.error || "Erro ao importar");

      alert(`Importados ${json.data.count} cedentes ✅`);
      setRows([]);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar Cedentes</h1>
        <p className="text-sm text-slate-600">
          Importação direta de contas já usadas (aprovadas automaticamente).
        </p>
      </div>

      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => e.target.files && parseExcel(e.target.files[0])}
      />

      {rows.length > 0 && (
        <>
          <div className="text-sm text-slate-600">
            {rows.length} cedentes prontos para importação
          </div>

          <div className="max-h-72 overflow-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2">CPF</th>
                  <th className="px-3 py-2">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2">{r.nomeCompleto}</td>
                    <td className="px-3 py-2">{r.cpf || "-"}</td>
                    <td className="px-3 py-2">{r.responsavelRef || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={importar}
            disabled={loading}
            className="rounded-xl bg-black px-5 py-2 text-white hover:bg-gray-800"
          >
            {loading ? "Importando..." : "Importar cedentes"}
          </button>
        </>
      )}
    </div>
  );
}
