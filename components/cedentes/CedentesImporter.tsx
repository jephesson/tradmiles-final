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

type PixTipo = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";

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
  pixTipo?: PixTipo;
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
    const val = r?.[k];
    if (val !== undefined && val !== null && String(val).trim() !== "") return val;
  }
  return "";
}

function asStr(v: any) {
  return String(v ?? "").trim();
}

function normPixTipo(v: string): PixTipo | undefined {
  const x = norm(v).replace(/\s+/g, "");
  if (!x) return undefined;

  if (x === "cpf") return "CPF";
  if (x === "cnpj") return "CNPJ";
  if (x === "email" || x === "e-mail" || x === "mail") return "EMAIL";
  if (x === "telefone" || x === "celular" || x === "fone" || x === "phone") return "TELEFONE";
  if (x === "aleatoria" || x === "aleatorio" || x === "random") return "ALEATORIA";

  // se já vier exatamente igual ao enum
  const upper = asStr(v).toUpperCase() as PixTipo;
  if (["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"].includes(upper)) return upper;

  return undefined;
}

/* =======================
   Componente
======================= */
export default function CedentesImporter() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [rows, setRows] = useState<ImportedCedente[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);

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
      .catch(() => setLastParseMsg("❌ Erro ao carregar funcionários."));
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
      funcionarios.find((f) => norm(f.name) === r) ||
      funcionarios.find((f) => firstName(f.name) === r)
    );
  }

  /* =======================
     Parse de uma aba
  ======================= */
  function parseSheet(workbook: XLSX.WorkBook, sheetName: string) {
    try {
      const ws = workbook.Sheets[sheetName];
      if (!ws) {
        setRows([]);
        setRawPreviewKeys([]);
        setLastParseMsg("❌ Aba não encontrada no arquivo.");
        return;
      }

      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
        defval: "",
        raw: false,
      });

      const keys = json[0] ? Object.keys(json[0]) : [];
      setRawPreviewKeys(keys);

      if (!json.length) {
        setRows([]);
        setLastParseMsg("⚠️ A aba está vazia (nenhuma linha encontrada).");
        return;
      }

      const parsed: ImportedCedente[] = json
        .map((r) => {
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

          const emailCriado = asStr(pick(r, ["Email", "E-mail", "email", "emailCriado", "Email Criado"]));

          const banco = asStr(pick(r, ["Banco", "banco"]));
          const pixTipoRaw = asStr(pick(r, ["PixTipo", "pixTipo", "Tipo Pix", "TipoPix"]));
          const chavePix = asStr(pick(r, ["ChavePix", "chavePix", "Chave Pix", "PIX"]));

          return {
            nomeCompleto: nome,
            cpf,

            telefone: telefone || undefined,
            dataNascimento: dataNasc || undefined,
            emailCriado: emailCriado || undefined,

            senhaEmail: asStr(pick(r, ["Senha Email", "senhaEmail", "Senha do Email"])) || undefined,
            senhaLatamPass:
              asStr(pick(r, ["Senha Latam", "Senha LATAM", "senhaLatamPass", "Senha LatamPass"])) || undefined,
            senhaSmiles: asStr(pick(r, ["Senha Smiles", "senhaSmiles"])) || undefined,
            senhaLivelo: asStr(pick(r, ["Senha Livelo", "senhaLivelo"])) || undefined,
            senhaEsfera: asStr(pick(r, ["Senha Esfera", "senhaEsfera"])) || undefined,

            banco: banco || undefined,
            pixTipo: normPixTipo(pixTipoRaw),
            chavePix: chavePix || undefined,

            responsavelRef: responsavelRef || undefined,
            ownerId: matched?.id ?? null,
            ownerName: matched?.name ?? null,
          };
        })
        .filter((r) => r.nomeCompleto && r.cpf);

      setRows(parsed);

      if (!parsed.length) {
        setLastParseMsg(
          "⚠️ Não consegui montar nenhuma linha para importação. Provável: aba errada ou nomes de colunas diferentes.\n" +
            "Confira as colunas detectadas logo abaixo."
        );
        return;
      }

      setLastParseMsg(`✅ ${parsed.length} linhas prontas para importar (aba: ${sheetName}).`);
    } catch (err: any) {
      console.error("[PARSE SHEET ERROR]", err);
      setRows([]);
      setLastParseMsg(
        "❌ Erro ao ler a aba. Possível arquivo protegido/senha ou formato diferente.\n" +
          `Detalhe: ${String(err?.message || err || "")}`
      );
    }
  }

  /* =======================
     Upload Excel (com try/catch + status)
  ======================= */
  function handleFile(file: File) {
    setFileName(file.name);
    setRows([]);
    setLastParseMsg("");
    setRawPreviewKeys([]);
    setSheetNames([]);
    setSelectedSheet("");
    setWb(null);
    setParsing(true);

    const reader = new FileReader();

    reader.onerror = () => {
      setParsing(false);
      setLastParseMsg("❌ Não consegui ler o arquivo (FileReader). Tente baixar o Excel e selecionar novamente.");
    };

    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (!result) throw new Error("Arquivo vazio no FileReader");

        const data = new Uint8Array(result as ArrayBuffer);

        // Aqui costuma falhar quando Excel é protegido/senha ou formato estranho
        const workbook = XLSX.read(data, { type: "array" });

        const names = workbook.SheetNames || [];
        if (!names.length) throw new Error("Nenhuma aba encontrada no Excel.");

        setWb(workbook);
        setSheetNames(names);

        const defaultSheet = names[0];
        setSelectedSheet(defaultSheet);

        parseSheet(workbook, defaultSheet);

        setParsing(false);
      } catch (err: any) {
        console.error("[XLSX READ ERROR]", err);
        setParsing(false);

        setLastParseMsg(
          "❌ Não consegui interpretar esse Excel.\n" +
            "Possíveis causas: arquivo protegido por senha, formato diferente, ou exportação incomum.\n" +
            `Detalhe: ${String(err?.message || err || "")}`
        );
      }
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
      setFileName("");
      setSheetNames([]);
      setSelectedSheet("");
      setRawPreviewKeys([]);
      setLastParseMsg("");
      setWb(null);

      // permite escolher o mesmo arquivo novamente
      if (inputRef.current) inputRef.current.value = "";
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
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          <span>📄 Escolher arquivo Excel</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {fileName ? (
          <div className="text-sm text-slate-600">
            Arquivo selecionado: <b>{fileName}</b>
          </div>
        ) : null}

        {parsing ? <div className="text-sm text-slate-600">Lendo o Excel…</div> : null}

        {lastParseMsg ? <div className="whitespace-pre-line text-sm text-slate-700">{lastParseMsg}</div> : null}
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

          {/* Debug de colunas detectadas */}
          {rawPreviewKeys.length > 0 && (
            <div className="rounded-xl border bg-slate-50 p-3 text-xs text-slate-700">
              <div className="mb-1 font-semibold">Colunas detectadas (primeira linha):</div>
              <div className="flex flex-wrap gap-2">
                {rawPreviewKeys.slice(0, 60).map((k) => (
                  <span key={k} className="rounded-full border bg-white px-2 py-1">
                    {k}
                  </span>
                ))}
                {rawPreviewKeys.length > 60 ? <span>…</span> : null}
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
