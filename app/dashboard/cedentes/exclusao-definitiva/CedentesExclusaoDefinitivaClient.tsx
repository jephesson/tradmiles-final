"use client";

import { buildExclusaoWhatsappShortMessage } from "@/lib/cedentes/exclusaoDefinitivaContent";
import {
  appendSmilesFlightsToExclusaoConfirm,
  formatUpcomingSmilesFlightsWarning,
  type UpcomingSmilesFlight,
} from "@/lib/cedentes/upcomingSmilesFlightsShared";
import { useEffect, useMemo, useState } from "react";

type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
type ScopeMode = "ACCOUNT" | "PROGRAM";
type ExclusionReasonCode =
  | "LATAM_FACE_NO_RESPONSE"
  | "LATAM_FACE_IMPOSSIBLE"
  | "DATA_DELETION_REQUEST";

type CedenteLite = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
};

type ExclusionRow = {
  id: string;
  cedenteId: string;
  cedenteIdentificador: string;
  cedenteNomeCompleto: string;
  cedenteCpf: string;
  scope: ScopeMode;
  program: Program | null;
  details: unknown;
  restoredAt?: string | null;
  restoreDetails?: unknown;
  createdAt: string;
  deletedBy?: { id: string; name: string; login: string } | null;
  restoredBy?: { id: string; name: string; login: string } | null;
};

type ListResponse<T> = {
  ok?: boolean;
  rows?: T[];
  error?: string;
};

type ActionResponse = {
  ok?: boolean;
  error?: string;
};

type CedentePreview = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  telefone: string | null;
  emailCriado: string | null;
  senhaEmail: string | null;
  senhaSmiles: string | null;
  senhaLatamPass: string | null;
  senhaLivelo: string | null;
  senhaEsfera: string | null;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
};

const EXCLUSION_REASONS: Array<{ code: ExclusionReasonCode; label: string; text: string }> = [
  {
    code: "LATAM_FACE_NO_RESPONSE",
    label: "Ausência de resposta para biometria facial",
    text:
      "Ausência de resposta e/ou conclusão da biometria facial exigida pela LATAM, impossibilitando a movimentação da conta e acarretando prejuízo financeiro à empresa.",
  },
  {
    code: "LATAM_FACE_IMPOSSIBLE",
    label: "Impossibilidade de fazer facial",
    text:
      "Impossibilidade operacional de realização da biometria facial exigida pela LATAM, o que inviabiliza a continuidade das operações com segurança.",
  },
  {
    code: "DATA_DELETION_REQUEST",
    label: "Solicitou exclusão dos dados",
    text:
      "Solicitação expressa de exclusão dos dados e encerramento do vínculo operacional, com encerramento da parceria. As credenciais ficam só na lista de excluídos, para reacesso interno se necessário.",
  },
];

function fmtDateTime(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

function fmtPoints(v?: number | null) {
  return new Intl.NumberFormat("pt-BR").format(Number(v || 0));
}

function maskCpf(cpf?: string | null) {
  const v = String(cpf || "").replace(/\D+/g, "");
  if (v.length !== 11) return cpf || "-";
  return `***.***.${v.slice(6, 9)}-${v.slice(9, 11)}`;
}

type StoredCredentials = {
  cpf?: string | null;
  telefone?: string | null;
  emailCriado?: string | null;
  senhaEmail?: string | null;
  senhaSmiles?: string | null;
  senhaLatamPass?: string | null;
  senhaLivelo?: string | null;
  senhaEsfera?: string | null;
};

function credentialsFromDetails(details: unknown): StoredCredentials | null {
  if (!details || typeof details !== "object") return null;
  const c = (details as { credentials?: StoredCredentials }).credentials;
  if (!c || typeof c !== "object") return null;
  return c;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export default function CedentesExclusaoDefinitivaClient() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [cedentes, setCedentes] = useState<CedenteLite[]>([]);
  const [excluded, setExcluded] = useState<ExclusionRow[]>([]);
  const [preview, setPreview] = useState<CedentePreview | null>(null);
  const [upcomingSmilesFlights, setUpcomingSmilesFlights] = useState<UpcomingSmilesFlight[]>(
    []
  );

  const [cedenteId, setCedenteId] = useState("");
  const [mode, setMode] = useState<ScopeMode>("ACCOUNT");
  const [program, setProgram] = useState<Program>("LATAM");
  const [password, setPassword] = useState("");
  const [reasonCode, setReasonCode] =
    useState<ExclusionReasonCode>("LATAM_FACE_NO_RESPONSE");

  const [q, setQ] = useState("");
  const [accessRow, setAccessRow] = useState<ExclusionRow | null>(null);
  const [accessPreview, setAccessPreview] = useState<CedentePreview | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [copiedField, setCopiedField] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const [rCed, rExc] = await Promise.all([
        fetch("/api/cedentes/lite", { cache: "no-store", credentials: "include" }),
        fetch("/api/cedentes/exclusao-definitiva", {
          cache: "no-store",
          credentials: "include",
        }),
      ]);

      const jCed = (await rCed.json().catch(() => ({}))) as ListResponse<CedenteLite>;
      const jExc = (await rExc.json().catch(() => ({}))) as ListResponse<ExclusionRow>;

      if (!rCed.ok || jCed?.ok === false) {
        throw new Error(jCed?.error || "Falha ao carregar cedentes.");
      }
      if (!rExc.ok || jExc?.ok === false) {
        throw new Error(jExc?.error || "Falha ao carregar excluídos.");
      }

      setCedentes(Array.isArray(jCed?.rows) ? jCed.rows : []);
      setExcluded(Array.isArray(jExc?.rows) ? jExc.rows : []);
    } catch (error: unknown) {
      alert(getErrorMessage(error, "Falha ao carregar tela de exclusão."));
      setCedentes([]);
      setExcluded([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (reasonCode === "DATA_DELETION_REQUEST" && mode !== "ACCOUNT") {
      setMode("ACCOUNT");
    }
  }, [reasonCode, mode]);

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      if (!cedenteId) {
        setPreview(null);
        setUpcomingSmilesFlights([]);
        return;
      }

      setPreviewLoading(true);
      try {
        const res = await fetch(
          `/api/cedentes/exclusao-definitiva?cedenteId=${encodeURIComponent(cedenteId)}`,
          {
            cache: "no-store",
            credentials: "include",
          }
        );

        const json = await res.json().catch(() => ({}));
        if (!res.ok || json?.ok === false) {
          throw new Error(json?.error || "Falha ao carregar preview do cedente.");
        }

        if (active) {
          setPreview((json?.preview || null) as CedentePreview | null);
          setUpcomingSmilesFlights(
            Array.isArray(json?.upcomingSmilesFlights)
              ? (json.upcomingSmilesFlights as UpcomingSmilesFlight[])
              : []
          );
        }
      } catch (error: unknown) {
        if (active) {
          setPreview(null);
          setUpcomingSmilesFlights([]);
          alert(getErrorMessage(error, "Falha ao carregar dados do cedente."));
        }
      } finally {
        if (active) setPreviewLoading(false);
      }
    }

    loadPreview();

    return () => {
      active = false;
    };
  }, [cedenteId]);

  const cedentesFiltrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return cedentes;
    return cedentes.filter((c) => {
      const hay = `${c.nomeCompleto} ${c.identificador} ${c.cpf}`.toLowerCase();
      return hay.includes(s);
    });
  }, [cedentes, q]);

  const cedSel = useMemo(
    () => cedentes.find((c) => c.id === cedenteId) || null,
    [cedentes, cedenteId]
  );

  const selectedReason = useMemo(
    () => EXCLUSION_REASONS.find((item) => item.code === reasonCode) || EXCLUSION_REASONS[0],
    [reasonCode]
  );

  const whatsappMessage = useMemo(() => {
    if (!preview) return "";
    return buildExclusaoWhatsappShortMessage(preview, selectedReason.text);
  }, [preview, selectedReason]);

  async function copyWhatsappMessage() {
    if (!whatsappMessage) {
      alert("Selecione um cedente para gerar a mensagem.");
      return;
    }
    try {
      await navigator.clipboard.writeText(whatsappMessage);
      alert("Mensagem copiada.");
    } catch {
      alert("Não foi possível copiar automaticamente.");
    }
  }

  async function downloadCredentialsPdf() {
    if (!cedenteId) {
      alert("Selecione um cedente para gerar o PDF.");
      return;
    }

    setDownloadingPdf(true);
    try {
      const params = new URLSearchParams({
        cedenteId,
        mode,
        reasonCode,
      });
      if (mode === "PROGRAM") params.set("program", program);

      const res = await fetch(
        `/api/cedentes/exclusao-definitiva/credentials-pdf?${params.toString()}`,
        { credentials: "include" }
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json?.error || `Erro ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ident = preview?.identificador || cedenteId;
      a.href = url;
      a.download = `exclusao-${ident}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      alert(getErrorMessage(error, "Falha ao baixar PDF."));
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function executarExclusao() {
    if (!cedenteId) return alert("Selecione um cedente.");
    if (!password.trim()) return alert("Informe sua senha para confirmar.");

    const exclusaoConta =
      mode === "ACCOUNT" || reasonCode === "DATA_DELETION_REQUEST";
    const checkSmiles =
      exclusaoConta || (mode === "PROGRAM" && program === "SMILES");
    const alvo = exclusaoConta ? "conta inteira (todos os programas)" : `programa ${program}`;
    const baseConfirm = `Confirma EXCLUSÃO DEFINITIVA do cedente ${cedSel?.nomeCompleto || ""} (${alvo})?\n\nO cedente sairá de todas as listas operacionais. Vendas já realizadas permanecem no histórico financeiro.`;
    const confirmMsg = checkSmiles
      ? appendSmilesFlightsToExclusaoConfirm(baseConfirm, upcomingSmilesFlights)
      : baseConfirm;
    if (!confirm(confirmMsg)) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/cedentes/exclusao-definitiva", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cedenteId,
          mode,
          program: mode === "PROGRAM" ? program : undefined,
          reasonCode,
          password: password.trim(),
        }),
      });

      const json = (await res.json().catch(() => ({}))) as ActionResponse;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status}`);
      }

      setPassword("");
      await loadAll();
      alert("Exclusão definitiva concluída.");
    } catch (error: unknown) {
      alert(getErrorMessage(error, "Falha ao excluir definitivamente."));
    } finally {
      setSaving(false);
    }
  }

  async function restaurarCedente(row: ExclusionRow) {
    if (row.scope !== "ACCOUNT") {
      alert("Somente exclusões de conta inteira podem restaurar CPF e cadastro.");
      return;
    }
    if (row.restoredAt) {
      alert("Este cedente já foi restaurado.");
      return;
    }
    if (!password.trim()) {
      alert("Informe sua senha de confirmação para restaurar.");
      return;
    }

    if (
      !confirm(
        `Confirma restaurar ${row.cedenteNomeCompleto} (${row.cedenteIdentificador})?\n\nO CPF original volta no cadastro. Vendas e credenciais permanecem. O cedente volta às listas operacionais.`
      )
    ) {
      return;
    }

    setRestoringId(row.id);
    try {
      const res = await fetch("/api/cedentes/exclusao-definitiva", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exclusionId: row.id,
          password: password.trim(),
        }),
      });

      const json = (await res.json().catch(() => ({}))) as ActionResponse;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status}`);
      }

      setPassword("");
      await loadAll();
      alert("Cedente restaurado. Credenciais e histórico permanecem.");
    } catch (error: unknown) {
      alert(getErrorMessage(error, "Falha ao restaurar cedente."));
    } finally {
      setRestoringId(null);
    }
  }

  function copyValue(field: string, value?: string | null) {
    const v = String(value || "").trim();
    if (!v) return;
    void navigator.clipboard.writeText(v).then(() => {
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(""), 1600);
    });
  }

  async function abrirAcesso(row: ExclusionRow) {
    setAccessRow(row);
    const stored = credentialsFromDetails(row.details);
    if (stored) {
      setAccessPreview({
        id: row.cedenteId,
        identificador: row.cedenteIdentificador,
        nomeCompleto: row.cedenteNomeCompleto,
        cpf: stored.cpf || row.cedenteCpf,
        telefone: stored.telefone || null,
        emailCriado: stored.emailCriado || null,
        senhaEmail: stored.senhaEmail || null,
        senhaSmiles: stored.senhaSmiles || null,
        senhaLatamPass: stored.senhaLatamPass || null,
        senhaLivelo: stored.senhaLivelo || null,
        senhaEsfera: stored.senhaEsfera || null,
        pontosLatam: 0,
        pontosSmiles: 0,
        pontosLivelo: 0,
        pontosEsfera: 0,
      });
      return;
    }

    setAccessLoading(true);
    try {
      const res = await fetch(
        `/api/cedentes/exclusao-definitiva?cedenteId=${encodeURIComponent(row.cedenteId)}`,
        { cache: "no-store", credentials: "include" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Falha ao carregar credenciais.");
      }
      const p = (json?.preview || null) as CedentePreview | null;
      setAccessPreview(
        p
          ? { ...p, cpf: p.cpf?.startsWith("EXCL-") ? row.cedenteCpf : p.cpf }
          : null
      );
    } catch (error: unknown) {
      setAccessPreview(null);
      alert(getErrorMessage(error, "Falha ao carregar acesso do excluído."));
    } finally {
      setAccessLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cedentes • Exclusão definitiva</h1>
        <p className="text-sm text-slate-600">
          Remove o cadastro das listas operacionais (Latam, Smiles, Livelo, Esfera e painel de
          emissões) e registra em Excluídos. As credenciais ficam guardadas nessa lista, para
          reacesso se precisar. O histórico de vendas anteriores é preservado.
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-5 space-y-4">
        <div className="font-medium">Excluir dados</div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <div className="text-xs text-slate-600">Buscar cedente</div>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nome, identificador ou CPF"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <div className="text-xs text-slate-600">Cedente</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
              value={cedenteId}
              onChange={(e) => setCedenteId(e.target.value)}
            >
              <option value="">Selecione...</option>
              {cedentesFiltrados.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeCompleto} ({c.identificador})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-xs text-slate-600">Escopo da exclusão</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm bg-white disabled:bg-slate-50"
              value={mode}
              disabled={reasonCode === "DATA_DELETION_REQUEST"}
              onChange={(e) => setMode(e.target.value as ScopeMode)}
            >
              <option value="ACCOUNT">Conta inteira</option>
              <option value="PROGRAM">Programa específico</option>
            </select>
            {reasonCode === "DATA_DELETION_REQUEST" ? (
              <div className="text-xs text-slate-500">
                Solicitação de exclusão de dados sempre remove a conta inteira e todos os programas.
              </div>
            ) : null}
          </label>

          {mode === "PROGRAM" ? (
            <label className="space-y-1">
              <div className="text-xs text-slate-600">Programa</div>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                value={program}
                onChange={(e) => setProgram(e.target.value as Program)}
              >
                <option value="LATAM">LATAM</option>
                <option value="SMILES">SMILES</option>
                <option value="LIVELO">LIVELO</option>
                <option value="ESFERA">ESFERA</option>
              </select>
            </label>
          ) : (
            <div />
          )}

          <label className="space-y-1 md:col-span-2">
            <div className="text-xs text-slate-600">Senha de confirmação</div>
            <input
              type="password"
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <div className="text-xs text-slate-600">Motivo da exclusão</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as ExclusionReasonCode)}
            >
              {EXCLUSION_REASONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            <div className="text-xs text-slate-500">{selectedReason.text}</div>
          </label>
        </div>

        {cedSel ? (
          <div className="text-xs text-slate-500">
            Selecionado: <b>{cedSel.nomeCompleto}</b> ({cedSel.identificador}) • CPF {maskCpf(cedSel.cpf)}
          </div>
        ) : null}

        {upcomingSmilesFlights.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div className="font-semibold">Voos Smiles ainda por ocorrer</div>
            <p className="mt-1 text-xs text-amber-800">
              Revise antes de excluir — as vendas permanecem no histórico, mas o voo ainda está
              agendado.
            </p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed">
              {formatUpcomingSmilesFlightsWarning(upcomingSmilesFlights).trim()}
            </pre>
          </div>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={executarExclusao}
            disabled={saving || loading}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Excluindo..." : "Excluir definitivamente"}
          </button>
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="font-medium">Envio ao cliente (WhatsApp)</div>
            <div className="text-xs text-slate-500">
              Baixe o PDF protegido (senha = CPF com 11 dígitos), anexe no WhatsApp e copie a mensagem curta abaixo.
              Gere o PDF antes de excluir definitivamente.
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={downloadCredentialsPdf}
              disabled={!preview || downloadingPdf}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {downloadingPdf ? "Gerando PDF..." : "Baixar PDF protegido"}
            </button>
            <button
              type="button"
              onClick={copyWhatsappMessage}
              disabled={!whatsappMessage}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Copiar mensagem
            </button>
          </div>
        </div>

        {previewLoading ? (
          <div className="text-sm text-slate-500">Carregando dados do cedente...</div>
        ) : !preview ? (
          <div className="text-sm text-slate-500">
            Selecione um cedente para gerar a mensagem.
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4 text-sm">
              <div className="rounded-xl border bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">LATAM</div>
                <div className="font-medium">{fmtPoints(preview.pontosLatam)}</div>
              </div>
              <div className="rounded-xl border bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Smiles</div>
                <div className="font-medium">{fmtPoints(preview.pontosSmiles)}</div>
              </div>
              <div className="rounded-xl border bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Livelo</div>
                <div className="font-medium">{fmtPoints(preview.pontosLivelo)}</div>
              </div>
              <div className="rounded-xl border bg-slate-50 px-3 py-2">
                <div className="text-xs text-slate-500">Esfera</div>
                <div className="font-medium">{fmtPoints(preview.pontosEsfera)}</div>
              </div>
            </div>

            <textarea
              readOnly
              value={whatsappMessage}
              className="min-h-[280px] w-full rounded-xl border px-3 py-3 text-sm"
            />
          </>
        )}
      </div>

      <div className="rounded-2xl border bg-white overflow-x-auto">
        <div className="px-5 py-3 border-b font-medium">Excluídos</div>
        {accessRow ? (
          <div className="border-b bg-slate-50 px-5 py-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Acesso guardado</div>
                <div className="text-xs text-slate-500">
                  {accessRow.cedenteNomeCompleto} ({accessRow.cedenteIdentificador})
                </div>
              </div>
              <button
                type="button"
                className="rounded-xl border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                onClick={() => {
                  setAccessRow(null);
                  setAccessPreview(null);
                }}
              >
                Fechar
              </button>
            </div>
            {accessLoading ? (
              <div className="text-sm text-slate-500">Carregando credenciais...</div>
            ) : !accessPreview ? (
              <div className="text-sm text-slate-500">
                Não há credenciais neste registro (exclusões antigas apagavam as senhas).
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 text-sm">
                {[
                  ["CPF", accessPreview.cpf, "cpf"],
                  ["E-mail", accessPreview.emailCriado, "email"],
                  ["Senha e-mail", accessPreview.senhaEmail, "senhaEmail"],
                  ["Senha LATAM", accessPreview.senhaLatamPass, "senhaLatam"],
                  ["Senha Smiles", accessPreview.senhaSmiles, "senhaSmiles"],
                  ["Senha Livelo", accessPreview.senhaLivelo, "senhaLivelo"],
                  ["Senha Esfera", accessPreview.senhaEsfera, "senhaEsfera"],
                ].map(([label, value, field]) => (
                  <div key={field} className="rounded-xl border bg-white px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">{label}</div>
                      <button
                        type="button"
                        className="text-xs font-medium text-slate-700 underline disabled:no-underline disabled:text-slate-400"
                        disabled={!String(value || "").trim()}
                        onClick={() => copyValue(String(field), String(value || ""))}
                      >
                        {copiedField === field ? "Copiado" : "Copiar"}
                      </button>
                    </div>
                    <div className="mt-0.5 break-all font-medium">{String(value || "").trim() || "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Cedente</th>
              <th className="px-3 py-2 text-left">Escopo</th>
              <th className="px-3 py-2 text-left">Programa</th>
              <th className="px-3 py-2 text-left">Responsável</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {excluded.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-slate-500" colSpan={6}>
                  Nenhum registro em excluídos.
                </td>
              </tr>
            ) : (
              excluded.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{fmtDateTime(r.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.cedenteNomeCompleto}</div>
                    <div className="text-xs text-slate-500">
                      {r.cedenteIdentificador} • CPF {maskCpf(r.cedenteCpf)}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.scope === "ACCOUNT" ? "Conta inteira" : "Programa"}</td>
                  <td className="px-3 py-2">{r.program || "-"}</td>
                  <td className="px-3 py-2">
                    {r.deletedBy?.name || "-"}
                    {r.deletedBy?.login ? (
                      <span className="text-xs text-slate-500"> (@{r.deletedBy.login})</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {r.restoredAt ? (
                      <div>
                        <div className="font-medium text-emerald-700">Restaurado</div>
                        <div className="text-xs text-slate-500">
                          {fmtDateTime(r.restoredAt)}
                          {r.restoredBy?.login ? ` por @${r.restoredBy.login}` : ""}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void abrirAcesso(r)}
                          className="rounded-xl border px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Acessar
                        </button>
                        {r.scope === "ACCOUNT" ? (
                          <button
                            type="button"
                            onClick={() => restaurarCedente(r)}
                            disabled={saving || loading || restoringId === r.id}
                            className="rounded-xl border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            {restoringId === r.id ? "Restaurando..." : "Restaurar"}
                          </button>
                        ) : (
                          <span className="self-center text-xs text-slate-500">Histórico preservado</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
