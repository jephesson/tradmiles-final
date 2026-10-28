  "use client";

  import { useEffect, useMemo, useState } from "react";
  import { useRouter, useSearchParams } from "next/navigation";
  import { Copy, FileDown, KeyRound, ListPlus, Loader2, MessageCircle, Star, X } from "lucide-react";
  import { VerificationCodeFetch } from "@/components/cedentes/VerificationCodeFetch";
  import { buildWhatsAppLink, normalizeBRPhoneToE164 } from "@/lib/whatsapp";

  type ProgramKey = "latam" | "smiles" | "livelo" | "esfera";

  type CedenteRowFromApproved = {
    id: string;
    identificador: string;
    nomeCompleto: string;
    cpf: string;
    telefone?: string | null;
    excludedPrograms?: string[];
  };

  type ApprovedResp = { ok: boolean; data?: any; error?: string };

  type PanelApiResp = {
    ok: true;
    program: string;
    months: Array<{ key: string; label: string }>;
    currentMonthKey: string;
    renewMonthKey: string;
    rows: Array<{
      cedenteId: string;
      total: number;
      manual: number; // vem da API, mas não exibimos
      renewEndOfMonth: number; // vem da API, mas não exibimos (só no card total)
      perMonth: Record<string, number>;
      latamClubAtivoAgora?: boolean;
      inFilaAssinatura?: boolean;
    }>;
    totals: { total: number; manual: number; renewEndOfMonth: number };
  };

  function cn(...xs: Array<string | false | null | undefined>) {
    return xs.filter(Boolean).join(" ");
  }

  const PROGRAMS: Array<{ key: ProgramKey; label: string; hint: string }> = [
    {
      key: "latam",
      label: "LATAM",
      hint: "Janela por meses (painel) + renovação mês-12",
    },
    { key: "smiles", label: "Smiles", hint: "Reset anual (painel por meses)" },
    { key: "livelo", label: "Livelo", hint: "Sem regra (por enquanto)" },
    { key: "esfera", label: "Esfera", hint: "Sem regra (por enquanto)" },
  ];

  function fmtInt(n: number) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-BR");
  }

  function programApiKey(p: ProgramKey): "LATAM" | "SMILES" | "LIVELO" | "ESFERA" | "IBERIA" {
    if (p === "smiles") return "SMILES";
    if (p === "livelo") return "LIVELO";
    if (p === "esfera") return "ESFERA";
    return "LATAM";
  }

  type CredentialsState = {
    cedenteId: string;
    nomeCompleto: string;
    identificador: string;
    cpf: string;
    email: string | null;
    senhaEmail: string | null;
    senhaPrograma: string | null;
    senhaLivelo: string | null;
  };

  export default function PainelEmissoesClient({
    initialProgram,
  }: {
    initialProgram: string;
  }) {
    const router = useRouter();
    const sp = useSearchParams();

    const [program, setProgram] = useState<ProgramKey>(() => {
      const p = String(initialProgram || "latam").toLowerCase();
      return (["latam", "smiles", "livelo", "esfera"].includes(p)
        ? p
        : "latam") as ProgramKey;
    });

    // cedentes
    const [cedentes, setCedentes] = useState<CedenteRowFromApproved[]>([]);
    const [cedentesLoading, setCedentesLoading] = useState(false);
    const [q, setQ] = useState("");

    // painel
    const [panel, setPanel] = useState<PanelApiResp | null>(null);
    const [panelLoading, setPanelLoading] = useState(false);

    const [credentials, setCredentials] = useState<CredentialsState | null>(null);
    const [credentialsLoading, setCredentialsLoading] = useState(false);
    const [credentialsError, setCredentialsError] = useState("");
    const [copiedField, setCopiedField] = useState("");
    const [pdfBusy, setPdfBusy] = useState(false);
    const [filaBusy, setFilaBusy] = useState(false);
    const [filaRowBusyId, setFilaRowBusyId] = useState("");

    function closeCredentials() {
      setCredentials(null);
      setCredentialsError("");
      setCopiedField("");
    }

    async function copyValue(field: string, value: string | null | undefined) {
      const text = String(value || "").trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        window.setTimeout(() => {
          setCopiedField((curr) => (curr === field ? "" : curr));
        }, 1400);
      } catch {
        // noop
      }
    }

    async function openCredentials(row: {
      cedenteId: string;
      nomeCompleto: string;
      identificador: string;
      cpf: string;
    }) {
      const apiProgram = programApiKey(program);
      setCredentials({
        cedenteId: row.cedenteId,
        nomeCompleto: row.nomeCompleto,
        identificador: row.identificador,
        cpf: row.cpf,
        email: null,
        senhaEmail: null,
        senhaPrograma: null,
        senhaLivelo: null,
      });
      setCredentialsError("");
      setCredentialsLoading(true);

      try {
        const fetches: Promise<Response>[] = [
          fetch(
            `/api/cedentes/credentials?cedenteId=${encodeURIComponent(
              row.cedenteId
            )}&program=${apiProgram}`,
            { cache: "no-store", credentials: "include" }
          ),
        ];
        if (apiProgram === "LATAM") {
          fetches.push(
            fetch(
              `/api/cedentes/credentials?cedenteId=${encodeURIComponent(
                row.cedenteId
              )}&program=LIVELO`,
              { cache: "no-store", credentials: "include" }
            )
          );
        }

        const responses = await Promise.all(fetches);
        const jsons = await Promise.all(
          responses.map((r) => r.json().catch(() => null))
        );
        const mainRes = responses[0];
        const mainJson = jsons[0];
        if (!mainRes.ok || !mainJson?.ok) {
          throw new Error(mainJson?.error || "Falha ao carregar credenciais.");
        }

        const liveloJson = jsons[1];
        setCredentials({
          cedenteId: row.cedenteId,
          nomeCompleto: row.nomeCompleto,
          identificador: row.identificador,
          cpf: String(mainJson.data?.cpf || row.cpf || ""),
          email: mainJson.data?.email ?? liveloJson?.data?.email ?? null,
          senhaEmail:
            mainJson.data?.senhaEmail ?? liveloJson?.data?.senhaEmail ?? null,
          senhaPrograma: mainJson.data?.senhaPrograma ?? null,
          senhaLivelo:
            apiProgram === "LATAM" ? liveloJson?.data?.senhaPrograma ?? null : null,
        });
      } catch (e: unknown) {
        setCredentialsError(
          e instanceof Error ? e.message : "Falha ao carregar credenciais."
        );
      } finally {
        setCredentialsLoading(false);
      }
    }

    function syncUrl(next: { programa?: string }) {
      const params = new URLSearchParams(sp?.toString());
      if (next.programa != null) params.set("programa", next.programa);
      router.replace(`/dashboard/painel-emissoes?${params.toString()}`, {
        scroll: false,
      });
    }

    useEffect(() => {
      syncUrl({ programa: program });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [program]);

    async function loadCedentesApproved() {
      setCedentesLoading(true);
      try {
        const res = await fetch("/api/cedentes/approved", { cache: "no-store" });
        const json: ApprovedResp = await res.json().catch(() => ({} as any));
        if (!res.ok || !json?.ok)
          throw new Error(json?.error || "Falha ao carregar cedentes.");

        const data = Array.isArray(json.data) ? json.data : [];
        setCedentes(
          data.map((r: any) => ({
            id: r.id,
            identificador: r.identificador,
            nomeCompleto: r.nomeCompleto,
            cpf: r.cpf,
            telefone: r.telefone || null,
            excludedPrograms: Array.isArray(r.excludedPrograms) ? r.excludedPrograms : [],
          }))
        );
      } catch (e: any) {
        setCedentes([]);
        alert(e?.message || "Erro ao carregar cedentes.");
      } finally {
        setCedentesLoading(false);
      }
    }

    async function loadPanel() {
      setPanelLoading(true);
      try {
        const prog = programApiKey(program);
        const ids = cedentes
          .filter((c) => !(c.excludedPrograms || []).includes(prog))
          .map((c) => c.id);
        const res = await fetch("/api/emissions/panel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            programa: program,
            months: 13,
            cedenteIds: ids, // garante que apareçam zerados também
          }),
        });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok || !data?.ok)
          throw new Error(data?.error || "Falha ao carregar painel");
        setPanel(data as PanelApiResp);
      } catch (e: any) {
        setPanel(null);
        alert(e?.message || "Erro ao carregar painel");
      } finally {
        setPanelLoading(false);
      }
    }

    const LATAM_FILA_PAX_LIMIT = 20;

    function isElegivelFila(r: {
      total: number;
      renewEndOfMonth: number;
      perMonth: Record<string, number>;
      latamClubAtivoAgora?: boolean;
      inFilaAssinatura?: boolean;
    }) {
      if (!panel) return false;
      if (r.latamClubAtivoAgora) return false;
      if (r.inFilaAssinatura) return false;
      const issuedThisMonth = Number(r.perMonth?.[panel.currentMonthKey] || 0);
      if (issuedThisMonth > 0) return false;
      const aposRenovacao = Math.max(
        0,
        Number(r.total || 0) - Number(r.renewEndOfMonth || 0)
      );
      return aposRenovacao < LATAM_FILA_PAX_LIMIT;
    }

    function markInFila(cedenteId: string) {
      setPanel((curr) => {
        if (!curr) return curr;
        return {
          ...curr,
          rows: curr.rows.map((row) =>
            row.cedenteId === cedenteId ? { ...row, inFilaAssinatura: true } : row
          ),
        };
      });
    }

    async function enqueueOne(row: {
      cedenteId: string;
      nomeCompleto: string;
    }) {
      if (program !== "latam") return;
      setFilaRowBusyId(row.cedenteId);
      try {
        const res = await fetch("/api/fila-assinatura", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cedenteId: row.cedenteId }),
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Falha ao colocar na fila.");
        }
        markInFila(row.cedenteId);
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "Falha ao colocar na fila.");
      } finally {
        setFilaRowBusyId("");
      }
    }

    async function enqueueEligibleFila() {
      if (program !== "latam") return;
      const n = eligibleFilaCount;
      if (n <= 0) {
        alert(
          "Ninguém elegível: precisa estar sem estrela (sem clube), sem emissão neste mês e com menos de 20 pax após a renovação do mês-12."
        );
        return;
      }
      if (
        !window.confirm(
          `Colocar ${n} cedente${n === 1 ? "" : "s"} elegível${n === 1 ? "" : "is"} na fila de assinatura?`
        )
      ) {
        return;
      }
      setFilaBusy(true);
      try {
        const res = await fetch("/api/fila-assinatura/auto-latam", {
          method: "POST",
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          added?: number;
          skipped?: number;
        } | null;
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Falha ao colocar na fila.");
        }
        await loadPanel();
        const added = Number(json.added || 0);
        alert(
          added > 0
            ? `${added} cedente${added === 1 ? "" : "s"} colocado${added === 1 ? "" : "s"} na fila de assinatura.`
            : "Ninguém novo para colocar na fila."
        );
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "Falha ao colocar na fila.");
      } finally {
        setFilaBusy(false);
      }
    }

    async function downloadRenewPdf() {
      if (program !== "latam") {
        alert("A renovação de pax no mês vale para LATAM.");
        return;
      }
      setPdfBusy(true);
      try {
        const res = await fetch(
          `/api/emissions/renew-pdf?programa=${encodeURIComponent(program)}`,
          { cache: "no-store", credentials: "include" }
        );
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(json?.error || "Falha ao gerar o PDF.");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `renovacao-pax-${panel?.currentMonthKey || "mes"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "Falha ao gerar o PDF.");
      } finally {
        setPdfBusy(false);
      }
    }

    // carrega cedentes 1x
    useEffect(() => {
      loadCedentesApproved();
    }, []);

    // carrega painel quando tiver cedentes
    useEffect(() => {
      if (cedentes.length === 0) return;
      loadPanel();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [program, cedentes.length]);

    const cedenteById = useMemo(() => {
      const m = new Map<string, CedenteRowFromApproved>();
      for (const c of cedentes) m.set(c.id, c);
      return m;
    }, [cedentes]);

    const rowsMerged = useMemo(() => {
      if (!panel) return [];

      const list = panel.rows.map((r) => {
        const c = cedenteById.get(r.cedenteId);
        return {
          ...r,
          nomeCompleto: c?.nomeCompleto || "—",
          identificador: c?.identificador || "—",
          cpf: c?.cpf || "",
          telefone: c?.telefone || null,
        };
      });

      // filtro
      const s = q.trim().toLowerCase();
      const filtered = !s
        ? list
        : list.filter((r) => {
            return (
              String(r.nomeCompleto).toLowerCase().includes(s) ||
              String(r.identificador).toLowerCase().includes(s) ||
              String(r.cpf || "").includes(s)
            );
          });

      // ✅ ORDEM ALFABÉTICA (A→Z), ignorando acentos; desempata por identificador e depois por total
      filtered.sort((a, b) => {
        const na = String(a.nomeCompleto || "");
        const nb = String(b.nomeCompleto || "");
        const byName = na.localeCompare(nb, "pt-BR", { sensitivity: "base" });
        if (byName) return byName;

        const ia = String(a.identificador || "");
        const ib = String(b.identificador || "");
        const byIdent = ia.localeCompare(ib, "pt-BR", { sensitivity: "base" });
        if (byIdent) return byIdent;

        return (b.total || 0) - (a.total || 0);
      });

      return filtered;
    }, [panel, cedenteById, q]);

    const maxTotal = useMemo(() => {
      return Math.max(1, ...rowsMerged.map((r) => Number(r.total || 0)));
    }, [rowsMerged]);

    // ✅ total que renova no mês corrente (CPFs / passageiros)
    const renewThisMonthTotal = useMemo(() => {
      if (!panel) return 0;

      // preferido: já vem pronto do backend
      const t = Number(panel.totals?.renewEndOfMonth);
      if (Number.isFinite(t)) return t;

      // fallback: soma a coluna do mês de renovação (mês-12) na tabela
      const key = panel.renewMonthKey;
      return panel.rows.reduce(
        (acc, r) => acc + Number(r.perMonth?.[key] || 0),
        0
      );
    }, [panel]);

    const issuedThisMonthTotal = useMemo(() => {
      if (!panel) return 0;
      const key = panel.currentMonthKey;
      return panel.rows.reduce(
        (acc, r) => acc + Number(r.perMonth?.[key] || 0),
        0
      );
    }, [panel]);

    const eligibleFilaCount = useMemo(() => {
      if (program !== "latam" || !panel) return 0;
      return panel.rows.filter((r) => isElegivelFila(r)).length;
    }, [program, panel]);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Painel de Emissões
              </h1>
              <p className="text-sm text-zinc-500">
                Visão mensal por cedente (estilo planilha) + destaque do mês atual
                + coluna de renovação (mês-12) em vermelho claro.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {program === "latam" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void enqueueEligibleFila()}
                    disabled={filaBusy || panelLoading || !panel || eligibleFilaCount <= 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-50"
                    title="Sem clube, sem emissão no mês e menos de 20 pax após a renovação do mês-12"
                  >
                    {filaBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ListPlus className="h-4 w-4" />
                    )}
                    {filaBusy
                      ? "Colocando…"
                      : `Fila de assinatura${eligibleFilaCount > 0 ? ` (${eligibleFilaCount})` : ""}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadRenewPdf()}
                    disabled={pdfBusy || panelLoading || !panel}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
                    title="PDF das contas que renovam pax neste mês e o total que fica disponível"
                  >
                    {pdfBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4" />
                    )}
                    {pdfBusy ? "Gerando…" : "PDF renovação"}
                  </button>
                </>
              ) : null}
              <button
                onClick={loadPanel}
                className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-700 shadow-sm hover:bg-zinc-50"
              >
                {panelLoading ? "Atualizando…" : "Atualizar"}
              </button>
            </div>
          </div>

          {/* Program Tabs */}
          <div className="flex flex-wrap gap-2">
            {PROGRAMS.map((p) => (
              <button
                key={p.key}
                onClick={() => setProgram(p.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm shadow-sm",
                  program === p.key
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                )}
                title={p.hint}
              >
                {p.label}
              </button>
            ))}
            <span className="ml-2 self-center text-xs text-zinc-500">
              {PROGRAMS.find((p) => p.key === program)?.hint}
            </span>
          </div>
        </div>

        {/* Top summary */}
        <div className="grid gap-3 md:grid-cols-4">
          <CardStat
            label="Cedentes"
            value={cedentesLoading ? "…" : fmtInt(cedentes.length)}
          />

          <CardStat
            label="Total (janela do painel)"
            value={panel ? fmtInt(panel.totals.total) : "—"}
            strong
          />

          <CardStat
            label="Passageiros emitidos no mês"
            value={panel ? fmtInt(issuedThisMonthTotal) : "—"}
            sub={panel ? `Base: ${panel.currentMonthKey}` : undefined}
          />

          <CardStat
            label="Renovam no mês corrente"
            value={panel ? fmtInt(renewThisMonthTotal) : "—"}
            tone="rose"
            sub={panel ? `Base: ${panel.renewMonthKey}` : undefined}
          />
        </div>

        {/* Filtro */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="md:w-[520px]">
              <label className="mb-1 block text-xs text-zinc-600">
                Buscar (nome / CPF / identificador)
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ex.: Maria / 12345678900 / CD00012"
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-zinc-300"
              />
            </div>

            <div className="text-xs text-zinc-500">
              {panel ? (
                <>
                  Mês atual em{" "}
                  <span className="rounded bg-emerald-100 px-1 py-0.5">
                    verde
                  </span>{" "}
                  ({panel.currentMonthKey}) • Renovação (mês-12) em{" "}
                  <span className="rounded bg-rose-100 px-1 py-0.5">vermelho</span>{" "}
                  ({panel.renewMonthKey})
                </>
              ) : (
                "Carregando painel…"
              )}
            </div>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Contagem (por mês)</h2>
            <div className="text-xs text-zinc-500">
              {panelLoading
                ? "Carregando…"
                : panel
                ? `${rowsMerged.length} linhas`
                : "—"}
            </div>
          </div>

          {!panel ? (
            <div className="text-sm text-zinc-600">
              Sem dados (verifique /api/emissions/panel).
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[1200px] border-separate border-spacing-0">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    {/* Sticky: Nome + Total junto */}
                    <th className="sticky left-0 z-20 border-b border-zinc-200 bg-white p-2">
                      Cedente (Total)
                    </th>

                    {panel.months.map((m) => {
                      const isCurrent = m.key === panel.currentMonthKey;
                      const isRenew = m.key === panel.renewMonthKey;
                      return (
                        <th
                          key={m.key}
                          className={cn(
                            "border-b border-zinc-200 p-2 text-center",
                            isCurrent && "bg-emerald-100",
                            !isCurrent && isRenew && "bg-rose-100"
                          )}
                          title={m.key}
                        >
                          {m.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {rowsMerged.map((r) => {
                    const barPct = Math.max(
                      0,
                      Math.min(100, (Number(r.total || 0) / maxTotal) * 100)
                    );
                    const waE164 = normalizeBRPhoneToE164(r.telefone);
                    const waHref = waE164 ? buildWhatsAppLink(waE164) : null;
                    const elegivelFila = program === "latam" && isElegivelFila(r);

                    return (
                      <tr key={r.cedenteId} className="text-sm">
                        {/* Sticky: Nome + Total */}
                        <td className="sticky left-0 z-10 border-b border-zinc-100 bg-white p-2">
                          <div className="min-w-[360px]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <div className="min-w-0 truncate font-medium">
                                    {r.nomeCompleto}
                                  </div>
                                  {r.latamClubAtivoAgora ? (
                                    <span
                                      title="Clube LATAM ativo ou pausado"
                                      className="inline-flex shrink-0 text-amber-500"
                                    >
                                      <Star size={15} className="fill-current" />
                                    </span>
                                  ) : null}
                                  {elegivelFila ? (
                                    <button
                                      type="button"
                                      disabled={filaRowBusyId === r.cedenteId}
                                      onClick={() =>
                                        void enqueueOne({
                                          cedenteId: r.cedenteId,
                                          nomeCompleto: r.nomeCompleto,
                                        })
                                      }
                                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-400 text-[12px] font-extrabold leading-none text-amber-950 shadow-sm hover:bg-amber-300 disabled:opacity-50"
                                      title={`Colocar ${r.nomeCompleto} na fila de assinatura`}
                                      aria-label={`Colocar ${r.nomeCompleto} na fila de assinatura`}
                                    >
                                      {filaRowBusyId === r.cedenteId ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        "F"
                                      )}
                                    </button>
                                  ) : r.inFilaAssinatura ? (
                                    <span
                                      title="Já está na fila de assinatura"
                                      className="inline-flex shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-zinc-200"
                                    >
                                      na fila
                                    </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openCredentials({
                                        cedenteId: r.cedenteId,
                                        nomeCompleto: r.nomeCompleto,
                                        identificador: r.identificador,
                                        cpf: r.cpf,
                                      })
                                    }
                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50 hover:text-zinc-900"
                                    title="Credenciais e código de verificação"
                                    aria-label={`Credenciais de ${r.nomeCompleto}`}
                                  >
                                    <KeyRound size={14} />
                                  </button>
                                  {waHref ? (
                                    <a
                                      href={waHref}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/90 transition hover:bg-emerald-100"
                                      title="Abrir WhatsApp do cedente"
                                      aria-label={`WhatsApp — ${r.nomeCompleto}`}
                                    >
                                      <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
                                    </a>
                                  ) : (
                                    <span
                                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 ring-1 ring-slate-200/90"
                                      title="Sem WhatsApp cadastrado"
                                      aria-hidden
                                    >
                                      <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
                                    </span>
                                  )}
                                </div>
                                <div className="truncate text-xs text-zinc-500">
                                  {r.identificador}
                                </div>
                              </div>

                              {/* databar do total colado no nome */}
                              <div className="shrink-0 w-[110px]">
                                <div className="relative h-7 rounded-md border border-zinc-200 bg-white">
                                  <div
                                    className="absolute inset-y-0 left-0 rounded-md bg-red-200"
                                    style={{ width: `${barPct}%` }}
                                  />
                                  <div className="relative z-10 flex h-full items-center justify-center text-xs font-semibold text-zinc-900">
                                    {fmtInt(r.total)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Meses */}
                        {panel.months.map((m) => {
                          const v = Number(r.perMonth?.[m.key] || 0);
                          const isCurrent = m.key === panel.currentMonthKey;
                          const isRenew = m.key === panel.renewMonthKey;

                          return (
                            <td
                              key={m.key}
                              className={cn(
                                "border-b border-zinc-100 p-2 text-center",
                                isCurrent && "bg-emerald-100",
                                !isCurrent && isRenew && "bg-rose-50"
                              )}
                            >
                              {v > 0 ? fmtInt(v) : ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 text-xs text-zinc-500">
            * Mês atual em verde. Coluna de renovação (LATAM) = mês-12 (
            <b>{panel?.renewMonthKey || "—"}</b>) em vermelho claro.
          </div>
        </div>

        {credentials ? (
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm"
              aria-label="Fechar credenciais"
              onClick={closeCredentials}
            />
            <div className="absolute left-1/2 top-1/2 w-[min(94vw,700px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-white p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Credenciais</div>
                  <div className="text-sm text-zinc-500">
                    {credentials.nomeCompleto} • {credentials.identificador}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeCredentials}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-zinc-600 hover:bg-zinc-100"
                  title="Fechar"
                >
                  <X size={16} />
                </button>
              </div>

              {credentialsError ? (
                <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {credentialsError}
                </div>
              ) : null}

              {credentialsLoading ? (
                <div className="rounded-xl border bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                  Carregando credenciais…
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <CredField
                    label="CPF (login)"
                    value={credentials.cpf}
                    copied={copiedField === "cpf"}
                    onCopy={() => copyValue("cpf", credentials.cpf)}
                  />
                  <CredField
                    label={`Senha ${PROGRAMS.find((p) => p.key === program)?.label || program.toUpperCase()}`}
                    value={credentials.senhaPrograma}
                    copied={copiedField === "senhaPrograma"}
                    onCopy={() => copyValue("senhaPrograma", credentials.senhaPrograma)}
                  />
                  {program === "latam" ? (
                    <CredField
                      label="Senha LIVELO"
                      value={credentials.senhaLivelo}
                      copied={copiedField === "senhaLivelo"}
                      onCopy={() => copyValue("senhaLivelo", credentials.senhaLivelo)}
                    />
                  ) : null}
                  <CredField
                    label="E-mail"
                    value={credentials.email}
                    copied={copiedField === "email"}
                    onCopy={() => copyValue("email", credentials.email)}
                  />
                  <div className={program === "latam" ? "md:col-span-2" : undefined}>
                    <CredField
                      label="Senha do e-mail"
                      value={credentials.senhaEmail}
                      copied={copiedField === "senhaEmail"}
                      onCopy={() => copyValue("senhaEmail", credentials.senhaEmail)}
                    />
                  </div>
                  {program === "latam" || program === "smiles" ? (
                    <div className="md:col-span-2">
                      <VerificationCodeFetch
                        cedenteId={credentials.cedenteId}
                        program={program === "smiles" ? "SMILES" : "LATAM"}
                        email={credentials.email}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function CredField({
    label,
    value,
    copied,
    onCopy,
  }: {
    label: string;
    value: string | null | undefined;
    copied: boolean;
    onCopy: () => void;
  }) {
    return (
      <div className="rounded-xl border bg-zinc-50 p-3">
        <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
        <div className="mt-1 break-all font-medium">{value || "-"}</div>
        <button
          type="button"
          onClick={onCopy}
          className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-900"
        >
          <Copy size={13} /> {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    );
  }

  function CardStat({
    label,
    value,
    strong,
    tone,
    sub,
  }: {
    label: string;
    value: string;
    strong?: boolean;
    tone?: "default" | "rose";
    sub?: string;
  }) {
    const toneCls =
      tone === "rose"
        ? "border-rose-200 bg-rose-50"
        : "border-zinc-200 bg-white";

    return (
      <div className={cn("rounded-2xl border p-4 shadow-sm", toneCls)}>
        <div className="text-xs text-zinc-500">{label}</div>
        <div className={cn("mt-1 text-xl", strong && "font-semibold")}>
          {value}
        </div>
        {sub ? <div className="mt-1 text-[11px] text-zinc-500">{sub}</div> : null}
      </div>
    );
  }
