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
  emailCriado?: string;

  senhaEmail?: string;
  senhaSmiles?: string;
  senhaLatamPass?: string;
  senhaLivelo?: string;
  senhaEsfera?: string;

  banco?: string;
  pixTipo?: "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";
  chavePix?: string;

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

// Pega valor por múltiplos nomes possíveis de coluna
function pick(r: Record<string, any>, keys: string[]) {
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "") return r[k];
  }
  return "";
}

function asStr(v: any) {
  return String(v ?? "").trim();
}

/* =======================
   Componente
======================= */
export default function CedentesImporter() {
  const [rows, setRows] = useState<ImportedCedente[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(false);

  const [fileName, setFileName] = useState<string>("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [rawPreviewKeys, setRawPreviewKeys] = useState<string[]>([]);
  const [lastParseMsg, setLastParseMsg] = useState<string>("");

  // guarda workbook em memória pra trocar de aba sem reenviar arquivo
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);

  /* =======================
     Carregar funcionários
  ======================= */
  useEffect(() => {
    fetch("/api/funcionarios", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.data)) setFuncionarios(j.data);
      })
      .catch(() => alert("Erro ao carregar funcionários."));
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
      funcionarios.find((f) => firstName(f.name) === r) ||
      funcionarios.find((f) => norm(f.name) === r)
    );
  }

  /* =======================
     Parse de uma aba
  ======================= */
  function parseSheet(workbook: XLSX.WorkBook, sheetName: string) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) {
      setRows([]);
      setLastParseMsg("Aba não encontrada no arquivo.");
      return;
    }

    const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
      defval: "",
      raw: false,
    });

    // mostra as chaves detectadas da primeira linha (ajuda MUITO debug)
    const keys = json[0] ? Object.keys(json[0]) : [];
    setRawPreviewKeys(keys);

    const parsed: ImportedCedente[] = json
      .map((r) => {
        // Nomes comuns (ajusta aqui se quiser)
        const nome = asStr(
          pick(r, ["Nome", "nome", "Nome Completo", "nomeCompleto", "NOME", "CEDENTE", "Cedente"])
        );

        const cpfRaw = asStr(
          pick(r, ["CPF", "Cpf", "cpf", "Documento", "DOCUMENTO", "CPF Cedente", "CPF do Cedente"])
        );
        const cpf = onlyDigits(cpfRaw);

        const responsavelRef = asStr(
          pick(r, ["Responsável", "Responsavel", "responsavel", "Owner", "Dono", "Funcionário", "Funcionario"])
        );

        const matched = matchResponsavel(responsavelRef);

        const telefone = asStr(pick(r, ["Telefone", "telefone", "Celular", "WhatsApp", "Fone"]));
        const dataNasc = asStr(pick(r, ["Nascimento", "Data Nascimento", "dataNascimento", "Dt Nasc"]));

        // no teu prisma o campo é emailCriado (não "email")
        const emailCriado = asStr(pick(r, ["Email", "E-mail", "email", "emailCriado", "Email Criado"]));

        return {
          nomeCompleto: nome,
          cpf,
          telefone: telefone || undefined,
          dataNascimento: dataNasc || undefined,
          emailCriado: emailCriado || undefined,

          senhaEmail: asStr(pick(r, ["Senha Email", "senhaEmail", "Senha do Email"])) || undefined,
          senhaLatamPass: asStr(pick(r, ["Senha Latam", "Senha LATAM", "senhaLatamPass", "Senha LatamPass"])) || undefined,
          senhaSmiles: asStr(pick(r, ["Senha Smiles", "senhaSmiles"])) || undefined,
          senhaLivelo: asStr(pick(r, ["Senha Livelo", "senhaLivelo"])) || undefined,
          senhaEsfera: asStr(pick(r, ["Senha Esfera", "senhaEsfera"])) || undefined,

          banco: asStr(pick(r, ["Banco", "banco"])) || undefined,
          pixTipo: (asStr(pick(r, ["PixTipo", "pixTipo", "Tipo Pix", "TipoPix"])) as any) || undefined,
          chavePix: asStr(pick(r, ["ChavePix", "chavePix", "Chave Pix", "PIX"])) || undefined,

          responsavelRef: responsavelRef || undefined,
          ownerId: matched?.id ?? null,
          ownerName: matched?.name ?? null,
        };
      })
      // mantém regra: só importa se tiver nome e cpf
      .filter((r) => r.nomeCompleto && r.cpf);

    setRows(parsed);

    if (!json.length) {
      setLastParseMsg("A aba está vazia (nenhuma linha encontrada).");
      return;
    }

    if (!parsed.length) {
      setLastParseMsg(
        "Não consegui montar nenhuma linha para importação. Provável: ABA errada ou nomes de colunas diferentes. Veja as colunas detectadas abaixo."
      );
      return;
    }

    setLastParseMsg(`✅ ${parsed.length} linhas prontas para importar (aba: ${sheetName}).`);
  }

  /* =======================
     Upload Excel
  ======================= */
  function handleFile(file: File) {
    setFileName(file.name);
    setRows([]);
    setLastParseMsg("");

    const reader = new FileReader();

    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });

      setWb(workbook);

      const names = workbook.SheetNames || [];
      setSheetNames(names);

      const defaultSheet = names[0] || "";
      setSelectedSheet(defaultSheet);

      if (!defaultSheet) {
        setLastParseMsg("Arquivo sem abas válidas.");
        return;
      }

      // parse inicial na primeira aba, mas agora você pode trocar
      parseSheet(workbook, defaultSheet);
    };

    reader.readAsArrayBuffer(file);
  }

  function onChangeSheet(sheet: string) {
    setSelectedSheet(sheet);
    setRows([]);
    setLastParseMsg("");
    if (wb) parseSheet(wb, sheet);
  }

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
      setLastParseMsg("");
      setRawPreviewKeys([]);
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

      {/* Botão file bonito */}
      <div className="space-y-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-black px-4 py-2 text-white hover:bg-gray-800">
          <span>📄 Escolher arquivo Excel</span>
          <input
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>

        {fileName ? (
          <div className="text-sm text-slate-600">
            Arquivo selecionado: <b>{fileName}</b>
          </div>
        ) : null}
      </div>

      {/* Seletor de aba */}
      {sheetNames.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">Escolha a aba do Excel</div>
          <select
            className="w-full max-w-md rounded-xl border px-3 py-2 text-sm"
            value={selectedSheet}
            onChange={(e) => onChangeSheet(e.target.value)}
          >
            {sheetNames.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {lastParseMsg ? (
            <div className="text-sm text-slate-700">{lastParseMsg}</div>
          ) : null}

          {/* Debug de colunas detectadas */}
          {rawPreviewKeys.length > 0 && (
            <div className="rounded-xl border bg-slate-50 p-3 text-xs text-slate-700">
              <div className="font-semibold mb-1">Colunas detectadas (primeira linha):</div>
              <div className="flex flex-wrap gap-2">
                {rawPreviewKeys.slice(0, 40).map((k) => (
                  <span key={k} className="rounded-full border bg-white px-2 py-1">
                    {k}
                  </span>
                ))}
                {rawPreviewKeys.length > 40 ? <span>…</span> : null}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabela */}
      {rows.length > 0 && (
        <>
          {pendentes > 0 && (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm">
              ⚠️ {pendentes} cedente(s) sem responsável. Selecione manualmente antes de importar.
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
                        r.ownerName
                      ) : (
                        <select
                          className="rounded border px-2 py-1 text-xs"
                          value={r.ownerId ?? ""}
                          onChange={(e) => {
                            const id = e.target.value || null;
                            const f = funcionarios.find((x) => x.id === id);
                            setRows((prev) =>
                              prev.map((x, idx) =>
                                idx === i ? { ...x, ownerId: id, ownerName: f?.name ?? null } : x
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
