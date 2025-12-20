"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  // Upload UX
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");

  /* =======================
     Carregar funcionários
  ======================= */
  useEffect(() => {
    let alive = true;

    fetch("/api/funcionarios", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.ok && Array.isArray(j.data)) {
          setFuncionarios(j.data);
        } else {
          console.error("Resposta inesperada /api/funcionarios:", j);
        }
      })
      .catch(() => {
        if (!alive) return;
        alert("Erro ao carregar funcionários.");
      });

    return () => {
      alive = false;
    };
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
          const responsavelRef = r["Responsável"] || r["Responsavel"] || r["responsavel"];

          const matched = matchResponsavel(responsavelRef);

          const nomeCompleto = String(r["Nome"] || r["nome"] || r["NOME"] || "").trim();
          const cpf = onlyDigits(String(r["CPF"] || r["cpf"] || r["Cpf"] || ""));

          const telefone = String(r["Telefone"] || r["telefone"] || "").trim();
          const dataNascimento = String(r["Nascimento"] || r["Data Nascimento"] || r["dataNascimento"] || "").trim();
          const email = String(r["Email"] || r["email"] || "").trim();

          const senhaLatam = String(r["Senha Latam"] || r["Senha LATAM"] || r["senhaLatam"] || "").trim();
          const senhaSmiles = String(r["Senha Smiles"] || r["senhaSmiles"] || "").trim();
          const senhaLivelo = String(r["Senha Livelo"] || r["senhaLivelo"] || "").trim();
          const senhaEsfera = String(r["Senha Esfera"] || r["senhaEsfera"] || "").trim();

          return {
            nomeCompleto,
            cpf,

            telefone: telefone || undefined,
            dataNascimento: dataNascimento || undefined,
            email: email || undefined,

            senhaLatam: senhaLatam || undefined,
            senhaSmiles: senhaSmiles || undefined,
            senhaLivelo: senhaLivelo || undefined,
            senhaEsfera: senhaEsfera || undefined,

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
     Se funcionários chegarem depois do excel, tenta casar automaticamente
     (sem sobrescrever escolhas manuais)
  ======================= */
  useEffect(() => {
    if (!rows.length) return;
    if (!funcionarios.length) return;

    setRows((prev) =>
      prev.map((r) => {
        if (r.ownerId) return r; // não mexe no que já está casado/manual
        const matched = matchResponsavel(r.responsavelRef);
        if (!matched) return r;
        return { ...r, ownerId: matched.id, ownerName: matched.name };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcionarios.length]);

  /* =======================
     Pendências
  ======================= */
  const pendentes = useMemo(() => rows.filter((r) => !r.ownerId).length, [rows]);

  /* =======================
     Importar
  ======================= */
  async function importar() {
    if (!rows.length) {
      alert("Nada para importar.");
      return;
    }
    if (pendentes > 0) {
      alert("Selecione os responsáveis pendentes antes de importar.");
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
      if (!json?.ok) throw new Error(json.error || "Erro ao importar");

      alert(`✅ Importados ${json.data.count} cedentes`);
      setRows([]);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
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
        <p className="text-sm text-slate-600">Contas já usadas → aprovadas automaticamente</p>
      </div>

      {/* UPLOAD: input escondido + botão */}
      <div className="space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setFileName(file.name);
            parseExcel(file);
          }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-white font-medium hover:bg-gray-800 transition"
        >
          📄 Escolher arquivo Excel
        </button>

        <div className="text-sm text-slate-600">
          {fileName ? (
            <>
              Arquivo selecionado: <b>{fileName}</b>
            </>
          ) : (
            "Nenhum arquivo selecionado"
          )}
        </div>

        {!funcionarios.length && (
          <div className="text-xs text-slate-500">
            Carregando funcionários… (se não casar automático agora, você seleciona manual e importa do mesmo jeito)
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1">
              Total: <b>{rows.length}</b>
            </span>
            <span className={`rounded-full px-3 py-1 ${pendentes ? "bg-yellow-100" : "bg-green-100"}`}>
              Pendentes: <b>{pendentes}</b>
            </span>
          </div>

          {pendentes > 0 && (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm">
              ⚠️ <b>{pendentes}</b> cedente(s) sem responsável. Selecione manualmente na tabela e depois importe.
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
                  <tr key={i} className={`border-t ${!r.ownerId ? "bg-yellow-50" : ""}`}>
                    <td className="px-3 py-2">{r.nomeCompleto}</td>
                    <td className="px-3 py-2">{r.cpf}</td>
                    <td className="px-3 py-2">
                      {r.ownerId ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-medium">{r.ownerName}</span>
                          <button
                            type="button"
                            className="text-xs underline text-slate-600 hover:text-slate-900"
                            onClick={() => {
                              setRows((prev) =>
                                prev.map((x, idx) =>
                                  idx === i ? { ...x, ownerId: null, ownerName: null } : x
                                )
                              );
                            }}
                          >
                            trocar
                          </button>
                        </span>
                      ) : (
                        <select
                          className="rounded border px-2 py-1 text-xs bg-white"
                          value={r.ownerId ?? ""}
                          onChange={(e) => {
                            const id = e.target.value || null;
                            const f = funcionarios.find((x) => x.id === id);
                            setRows((prev) =>
                              prev.map((x, idx) =>
                                idx === i
                                  ? { ...x, ownerId: id, ownerName: f?.name ?? null }
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
            {pendentes > 0 ? `Faltam ${pendentes} responsáveis` : loading ? "Importando..." : "Importar todos"}
          </button>
        </>
      )}
    </div>
  );
}
