"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

/* =======================
   Tipos
======================= */
type Funcionario = {
  id: string;
  name: string;
  login: string;
  employeeId?: string | null;
};

type ImportedCedente = {
  nomeCompleto: string;
  cpf: string;
  telefone?: string;
  dataNascimento?: string;
  email?: string;

  senhaLatam?: string;
  senhaSmiles?: string;
  senhaLivelo?: string;
  senhaEsfera?: string;

  responsavelRef?: string; // vindo do Excel
  ownerId?: string | null;
  ownerName?: string | null;
};

/* =======================
   Utils
======================= */
function norm(v?: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function onlyDigits(v?: string) {
  return (v || "").replace(/\D+/g, "");
}

function firstName(v?: string) {
  return norm(v).split(" ")[0] || "";
}

/* =======================
   Componente
======================= */
export default function CedentesImporter() {
  const [rows, setRows] = useState<ImportedCedente[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(false);

  /* =======================
     Carregar funcionários
  ======================= */
  useEffect(() => {
    fetch("/api/funcionarios", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.data)) {
          setFuncionarios(j.data);
        }
      })
      .catch(() => {
        alert("Erro ao carregar funcionários.");
      });
  }, []);

  /* =======================
     Match automático
  ======================= */
  function matchResponsavel(ref?: string): Funcionario | undefined {
    if (!ref) return undefined;
    const r = norm(ref);

    return (
      funcionarios.find((f) => norm(f.login) === r) ||
      funcionarios.find((f) => norm(f.employeeId || "") === r) ||
      funcionarios.find((f) => firstName(f.name) === r)
    );
  }

  /* =======================
     Parse Excel
  ======================= */
  function parseExcel(file: File) {
    const reader = new FileReader();

    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });

      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
        defval: "",
      });

      const parsed: ImportedCedente[] = json
        .map((r) => {
          const responsavelRef = r["Responsável"] || r["Responsavel"];

          const matched = matchResponsavel(responsavelRef);

          return {
            nomeCompleto: String(r["Nome"] || r["nome"] || "").trim(),
            cpf: onlyDigits(r["CPF"]),
            telefone: String(r["Telefone"] || "").trim() || undefined,
            dataNascimento: String(r["Nascimento"] || "").trim() || undefined,
            email: String(r["Email"] || "").trim() || undefined,

            senhaLatam: String(r["Senha Latam"] || "").trim() || undefined,
            senhaSmiles: String(r["Senha Smiles"] || "").trim() || undefined,
            senhaLivelo: String(r["Senha Livelo"] || "").trim() || undefined,
            senhaEsfera: String(r["Senha Esfera"] || "").trim() || undefined,

            responsavelRef: responsavelRef ? String(responsavelRef) : undefined,
            ownerId: matched?.id ?? null,
            ownerName: matched?.name ?? null,
          };
        })
        .filter((r) => r.nomeCompleto && r.cpf);

      setRows(parsed);
    };

    reader.readAsArrayBuffer(file);
  }

  /* =======================
     Pendências
  ======================= */
  const pendentes = useMemo(
    () => rows.filter((r) => !r.ownerId).length,
    [rows]
  );

  /* =======================
     Importar
  ======================= */
  async function importar() {
    setLoading(true);
    try {
      const res = await fetch("/api/cedentes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json.error || "Erro ao importar");

      alert(`✅ Importados ${json.data.count} cedentes`);
      setRows([]);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  /* =======================
     UI
  ======================= */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar Cedentes</h1>
        <p className="text-sm text-slate-600">
          Contas já usadas → aprovadas automaticamente
        </p>
      </div>

      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => e.target.files && parseExcel(e.target.files[0])}
      />

      {rows.length > 0 && (
        <>
          {pendentes > 0 && (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm">
              ⚠️ {pendentes} cedente(s) sem responsável. Selecione manualmente
              antes de importar.
            </div>
          )}

          <div className="max-h-96 overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Nome</th>
                  <th className="px-3 py-2">CPF</th>
                  <th className="px-3 py-2">Responsável</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-t ${
                      !r.ownerId ? "bg-yellow-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2">{r.nomeCompleto}</td>
                    <td className="px-3 py-2">{r.cpf}</td>
                    <td className="px-3 py-2">
                      {r.ownerId ? (
                        r.ownerName
                      ) : (
                        <select
                          className="rounded border px-2 py-1 text-xs"
                          value={r.ownerId ?? ""}
                          onChange={(e) => {
                            const id = e.target.value || null;
                            const f = funcionarios.find(
                              (x) => x.id === id
                            );
                            setRows((prev) =>
                              prev.map((x, idx) =>
                                idx === i
                                  ? {
                                      ...x,
                                      ownerId: id,
                                      ownerName: f?.name ?? null,
                                    }
                                  : x
                              )
                            );
                          }}
                        >
                          <option value="">Selecionar</option>
                          {funcionarios.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name} ({f.login})
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={importar}
            disabled={loading || pendentes > 0}
            className="rounded-xl bg-black px-5 py-2 text-white disabled:opacity-50"
          >
            {pendentes > 0
              ? `Faltam ${pendentes} responsáveis`
              : loading
              ? "Importando..."
              : "Importar todos"}
          </button>
        </>
      )}
    </div>
  );
}
