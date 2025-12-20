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

type ColumnMap = {
  nomeCompleto?: string;
  cpf?: string;
  telefone?: string;
  dataNascimento?: string;
  emailCriado?: string;

  responsavel?: string;

  banco?: string;
  pixTipo?: string;
  chavePix?: string;

  senhaEmail?: string;
  senhaLatamPass?: string;
  senhaSmiles?: string;
  senhaLivelo?: string;
  senhaEsfera?: string;
};

// ✅ FIX: typing do required (opcional)
type FieldDef = { key: keyof ColumnMap; label: string; required?: boolean };

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

  const upper = asStr(v).toUpperCase() as PixTipo;
  if (["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"].includes(upper)) return upper;

  return undefined;
}

/* =======================
   Defaults de mapeamento
   (tenta acertar sozinho quando detectar colunas parecidas)
======================= */
function guessColumnMap(keys: string[]): ColumnMap {
  const nkeys = keys.map((k) => ({ raw: k, n: norm(k).replace(/\s+/g, "") }));

  const find = (candidates: string[]) => {
    const cand = candidates.map((c) => norm(c).replace(/\s+/g, ""));
    const exact = nkeys.find((k) => cand.includes(k.n));
    if (exact) return exact.raw;

    // fallback: contém palavras-chave
    const contains = (needle: string) => nkeys.find((k) => k.n.includes(needle))?.raw;
    for (const c of cand) {
      const got = contains(c);
      if (got) return got;
    }
    return undefined;
  };

  return {
    nomeCompleto: find(["nome", "nomecompleto", "cedente", "titular"]),
    cpf: find(["cpf", "documento", "cpfdocedente"]),
    telefone: find(["telefone", "celular", "whatsapp", "fone"]),
    dataNascimento: find(["datanascimento", "nascimento", "dtnasc"]),
    emailCriado: find(["email", "e-mail", "emailcriado"]),

    responsavel: find(["responsavel", "responsável", "owner", "dono", "funcionario", "funcionário", "pertence"]),

    banco: find(["banco"]),
    pixTipo: find(["pixtipo", "tipopix"]),
    chavePix: find(["chavepix", "pix", "chavepixcpf"]),

    senhaEmail: find(["senhaemail", "senha do email", "senhadoemail"]),
    senhaLatamPass: find(["senhalatam", "senhalatampass", "senha latam", "senha latam pass"]),
    senhaSmiles: find(["senhasmiles", "senha smiles"]),
    senhaLivelo: find(["senhalivelo", "senha livelo"]),
    senhaEsfera: find(["senhaesfera", "senha esfera"]),
  };
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

  // NOVO: mapeamento de colunas (por aba)
  const [columnMap, setColumnMap] = useState<ColumnMap>({});

  // ✅ FIX: tipado com FieldDef[] (required opcional)
  const fieldDefs = useMemo<FieldDef[]>(
    () => [
      { key: "nomeCompleto", label: "Nome completo", required: true },
      { key: "cpf", label: "CPF", required: true },

      { key: "telefone", label: "Telefone" },
      { key: "dataNascimento", label: "Data de nascimento" },
      { key: "emailCriado", label: "Email criado" },

      { key: "responsavel", label: "Responsável (ref no Excel)" },

      { key: "banco", label: "Banco" },
      { key: "pixTipo", label: "Tipo de Pix" },
      { key: "chavePix", label: "Chave Pix" },

      { key: "senhaEmail", label: "Senha do Email" },
      { key: "senhaLatamPass", label: "Senha LATAM Pass" },
      { key: "senhaSmiles", label: "Senha Smiles" },
      { key: "senhaLivelo", label: "Senha Livelo" },
      { key: "senhaEsfera", label: "Senha Esfera" },
    ],
    []
  );

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
     Parse usando mapeamento
  ======================= */
  function parseJsonWithMap(json: Record<string, any>[], map: ColumnMap, sheetName: string) {
    if (!json.length) {
      setRows([]);
      setLastParseMsg("⚠️ A aba está vazia (nenhuma linha encontrada).");
      return;
    }

    const get = (r: Record<string, any>, col?: string) => (col ? asStr(r?.[col]) : "");

    const parsed: ImportedCedente[] = json
      .map((r) => {
        const nome = get(r, map.nomeCompleto);
        const cpf = onlyDigits(get(r, map.cpf));

        const responsavelRef = get(r, map.responsavel);
        const matched = matchResponsavel(responsavelRef);

        const telefone = get(r, map.telefone);
        const dataNasc = get(r, map.dataNascimento);
        const emailCriado = get(r, map.emailCriado);

        const banco = get(r, map.banco);
        const pixTipoRaw = get(r, map.pixTipo);
        const chavePix = get(r, map.chavePix);

        return {
          nomeCompleto: nome,
          cpf,

          telefone: telefone || undefined,
          dataNascimento: dataNasc || undefined,
          emailCriado: emailCriado || undefined,

          senhaEmail: get(r, map.senhaEmail) || undefined,
          senhaLatamPass: get(r, map.senhaLatamPass) || undefined,
          senhaSmiles: get(r, map.senhaSmiles) || undefined,
          senhaLivelo: get(r, map.senhaLivelo) || undefined,
          senhaEsfera: get(r, map.senhaEsfera) || undefined,

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
        "⚠️ Não consegui montar nenhuma linha para importação.\n" +
          "Provável: mapeamento errado (Nome/CPF).\n" +
          "Ajuste o mapeamento acima e clique em “Reprocessar”."
      );
      return;
    }

    setLastParseMsg(`✅ ${parsed.length} linhas prontas para importar (aba: ${sheetName}).`);
  }

  /* =======================
     Parse de uma aba (detecta colunas, sugere mapa e processa)
  ======================= */
  function parseSheet(workbook: XLSX.WorkBook, sheetName: string, keepExistingMap = false) {
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

      const guessed = guessColumnMap(keys);
      const mapToUse = keepExistingMap ? columnMap : guessed;

      if (!keepExistingMap) setColumnMap(guessed);

      parseJsonWithMap(json, mapToUse, sheetName);
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
    setColumnMap({});
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
    setRawPreviewKeys([]);
    setColumnMap({});
    if (wb) parseSheet(wb, sheet);
  }

  function reprocessar() {
    if (!wb || !selectedSheet) return;
    parseSheet(wb, selectedSheet, true);
  }

  /* =======================
     Pendências
  ======================= */
  const pendentes = useMemo(() => rows.filter((r) => !r.ownerId).length, [rows]);

  const mapHasEssentials = useMemo(() => {
    return Boolean(columnMap.nomeCompleto && columnMap.cpf);
  }, [columnMap]);

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
      setColumnMap({});

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
        <div className="flex flex-col gap-3">
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

          {/* Mapeamento de colunas */}
          {rawPreviewKeys.length > 0 && (
            <div className="rounded-xl border bg-white p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm">Mapeamento de colunas</div>
                  <div className="text-xs text-slate-600">
                    Escolha quais colunas do Excel viram cada campo do sistema. (Obrigatório: Nome + CPF)
                  </div>
                </div>

                <button
                  type="button"
                  onClick={reprocessar}
                  className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
                  disabled={!wb || !selectedSheet || rawPreviewKeys.length === 0}
                >
                  🔄 Reprocessar
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {fieldDefs.map((f) => {
                  const value = (columnMap as any)[f.key] ?? "";
                  return (
                    <div key={String(f.key)} className="flex items-center gap-3">
                      <div className="w-44 text-xs">
                        {f.label} {f.required ? <span className="text-red-600">*</span> : null}
                      </div>

                      <select
                        className="flex-1 rounded border px-2 py-1 text-xs"
                        value={value}
                        onChange={(e) =>
                          setColumnMap((prev) => ({
                            ...prev,
                            [f.key]: e.target.value || undefined,
                          }))
                        }
                      >
                        <option value="">— Não usar —</option>
                        {rawPreviewKeys.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {!mapHasEssentials ? (
                <div className="text-xs text-red-700">
                  ⚠️ Selecione pelo menos <b>Nome completo</b> e <b>CPF</b> para conseguir importar.
                </div>
              ) : null}
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
            disabled={loading || pendentes > 0 || !mapHasEssentials}
            className="rounded-xl bg-black px-5 py-2 text-white disabled:opacity-50"
          >
            {!mapHasEssentials
              ? "Selecione Nome e CPF"
              : pendentes > 0
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
