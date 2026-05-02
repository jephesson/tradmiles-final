"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  Loader2,
  Package,
  Plus,
  Receipt,
  Save,
  Search,
  Sparkles,
  Trash2,
  Unlock,
  UserRound,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";

type LoyaltyProgram = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";

type Cedente = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
  scoreMedia?: number;
};

type PurchaseStatus = "OPEN" | "DRAFT" | "READY" | "CLOSED" | "CANCELED";

type PurchaseItemType =
  | "CLUB"
  | "POINTS_BUY"
  | "TRANSFER"
  | "ADJUSTMENT"
  | "EXTRA_COST";

type TransferMode = "FULL_POINTS" | "POINTS_PLUS_CASH";

type PurchaseItem = {
  id?: string;
  type: PurchaseItemType;
  title: string;
  details?: string;

  programFrom?: LoyaltyProgram | null;
  programTo?: LoyaltyProgram | null;

  pointsBase: number;
  bonusMode?: "PERCENT" | "TOTAL" | "" | null;
  bonusValue?: number | null;
  pointsFinal: number;

  transferMode?: TransferMode | null;
  pointsDebitedFromOrigin: number;

  amountCents: number;
};

type PurchaseDraft = {
  id: string;
  numero: string;
  status: PurchaseStatus;

  cedenteId: string;

  ciaProgram: LoyaltyProgram | null;
  ciaPointsTotal: number;

  cedentePayCents: number;
  vendorCommissionBps: number;
  targetMarkupCents: number;

  subtotalCostCents: number;
  vendorCommissionCents: number;
  totalCostCents: number;

  costPerKiloCents: number;
  targetPerKiloCents: number;

  expectedLatamPoints: number | null;
  expectedSmilesPoints: number | null;
  expectedLiveloPoints: number | null;
  expectedEsferaPoints: number | null;

  note: string | null;

  items: PurchaseItem[];
};

type ClubMeta = {
  program: LoyaltyProgram;
  tierK: number;
  priceCents: number;
  renewalDay: number;
  startDateISO: string;
  bonusPoints: number;
};

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function normalizeScore(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n * 100) / 100));
}
function fmtScore(v: unknown) {
  return normalizeScore(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}
function scoreBadgeClass(v: unknown) {
  const s = normalizeScore(v);
  if (s >= 8) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s >= 6) return "border-amber-200 bg-amber-50 text-amber-700";
  if (s >= 4) return "border-orange-200 bg-orange-50 text-orange-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}
function clampInt(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.trunc(x);
}
function roundCents(n: number) {
  return Math.round(n);
}
function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function clampDay(n: any) {
  const x = clampInt(n);
  if (x <= 0) return 1;
  if (x > 31) return 31;
  return x;
}
function safeJsonParse<T>(s?: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function calcItemPointsFinal(item: PurchaseItem) {
  const base = clampInt(item.pointsBase);
  const mode = item.bonusMode || "";
  const val = item.bonusValue ?? 0;

  if (!mode) return base;

  if (mode === "PERCENT") {
    const pct = Math.max(0, clampInt(val));
    const bonus = Math.round((base * pct) / 100);
    return base + bonus;
  }

  if (mode === "TOTAL") {
    const total = Math.max(0, clampInt(val));
    return base + total;
  }

  return base;
}

function pointsForMilheiro(d: PurchaseDraft) {
  const cia = d.ciaProgram;
  if (cia === "LATAM")
    return clampInt(d.expectedLatamPoints ?? d.ciaPointsTotal ?? 0);
  if (cia === "SMILES")
    return clampInt(d.expectedSmilesPoints ?? d.ciaPointsTotal ?? 0);
  return clampInt(d.ciaPointsTotal ?? 0);
}

function computeTotals(d: PurchaseDraft) {
  const itemsArr = Array.isArray(d.items) ? d.items : [];
  const itemsCost = itemsArr.reduce(
    (acc, it) => acc + (it.amountCents || 0),
    0
  );

  const subtotal = itemsCost + (d.cedentePayCents || 0);

  const vendor = roundCents(
    (subtotal * (d.vendorCommissionBps || 0)) / 10000
  );
  const total = subtotal + vendor;

  const pts = Math.max(0, pointsForMilheiro(d));
  const denom = pts / 1000;

  const costPerKilo = denom > 0 ? roundCents(total / denom) : 0;
  const targetPerKilo = costPerKilo + (d.targetMarkupCents || 0);

  return {
    subtotalCostCents: subtotal,
    vendorCommissionCents: vendor,
    totalCostCents: total,
    costPerKiloCents: costPerKilo,
    targetPerKiloCents: targetPerKilo,
  };
}

function computeProgramDeltas(items: PurchaseItem[]) {
  const out: Record<LoyaltyProgram, number> = {
    LATAM: 0,
    SMILES: 0,
    LIVELO: 0,
    ESFERA: 0,
  };

  const arr = Array.isArray(items) ? items : [];
  for (const it of arr) {
    if (it.programTo) out[it.programTo] += clampInt(it.pointsFinal);
    if (it.programFrom)
      out[it.programFrom] -= clampInt(it.pointsDebitedFromOrigin);
  }
  return out;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });

  const text = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok || data?.ok === false) {
    console.error("API FAIL:", url, res.status, data);
    throw new Error(data?.error || `Erro ${res.status}`);
  }
  return data as T;
}

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

const PROGRAM_LABEL: Record<LoyaltyProgram, string> = {
  LATAM: "LATAM",
  SMILES: "Smiles",
  LIVELO: "Livelo",
  ESFERA: "Esfera",
};

const FIELD_LABEL =
  "text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const CONTROL_INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";
const CONTROL_INPUT_MONO = cn(CONTROL_INPUT, "font-mono tabular-nums");
/** Mesmo visual de CONTROL_INPUT_MONO, porém sem w-full (para usar em flex sem esmagar o vizinho). */
const CONTROL_INPUT_MONO_FLEX =
  "min-w-[7.5rem] flex-1 basis-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-mono tabular-nums text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";
/** Select compacto (% / +Pts) — CONTROL_SELECT inclui w-full e quebra layout em flex quando cn não faz merge. */
const BONUS_MODE_SELECT_CLASS =
  "w-[6.25rem] shrink-0 self-stretch rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";
const CONTROL_SELECT =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";
const CONTROL_SELECT_SM =
  "w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";
const BTN_PRIMARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50";
const BTN_SECONDARY =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50";
const BTN_EMERALD =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-50";
const BTN_GHOST =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50";
const SECTION =
  "relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/60 shadow-sm shadow-slate-200/35";
const TABLE_HEAD = "bg-slate-50/90 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";

const CLUB_TIERS = [1, 2, 3, 5, 7, 10, 12, 15, 20];

function StepSection({
  step,
  title,
  hint,
  action,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={SECTION}>
      <div className="p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white shadow-md shadow-slate-900/15"
              aria-hidden
            >
              {step}
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
              {hint ? (
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>
              ) : null}
            </div>
          </div>
          {action ? <div className="shrink-0 flex flex-wrap gap-2">{action}</div> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

/** ✅ NORMALIZAÇÃO CENTRAL (mata o reduce undefined) */
function normalizeItem(it: any): PurchaseItem {
  return {
    id: it?.id ?? undefined,
    type: (it?.type || "TRANSFER") as PurchaseItemType,
    title: String(it?.title || ""),
    details: it?.details ? String(it.details) : "",

    programFrom: (it?.programFrom ?? null) as any,
    programTo: (it?.programTo ?? null) as any,

    pointsBase: clampInt(it?.pointsBase),
    bonusMode: (it?.bonusMode ?? "") as any,
    bonusValue:
      it?.bonusValue === null || it?.bonusValue === undefined
        ? 0
        : clampInt(it?.bonusValue),
    pointsFinal: clampInt(it?.pointsFinal),

    transferMode: (it?.transferMode ?? null) as any,
    pointsDebitedFromOrigin: clampInt(it?.pointsDebitedFromOrigin),

    amountCents: clampInt(it?.amountCents),
  };
}

function normalizeDraft(raw: any, cedenteSel?: Cedente | null): PurchaseDraft {
  const items = Array.isArray(raw?.items) ? raw.items.map(normalizeItem) : [];

  const d: PurchaseDraft = {
    id: String(raw?.id || ""),
    numero: String(raw?.numero || ""),
    status: (raw?.status || "DRAFT") as PurchaseStatus,

    cedenteId: String(raw?.cedenteId || cedenteSel?.id || ""),

    ciaProgram: (raw?.ciaProgram ?? raw?.ciaAerea ?? null) as any,
    ciaPointsTotal: clampInt(raw?.ciaPointsTotal ?? raw?.pontosCiaTotal ?? 0),

    cedentePayCents: clampInt(raw?.cedentePayCents ?? 0),
    vendorCommissionBps: clampInt(raw?.vendorCommissionBps ?? 0),
    targetMarkupCents: clampInt(
      raw?.targetMarkupCents ?? raw?.metaMarkupCents ?? 0
    ),

    subtotalCostCents: clampInt(
      raw?.subtotalCostCents ?? raw?.subtotalCents ?? 0
    ),
    vendorCommissionCents: clampInt(
      raw?.vendorCommissionCents ?? raw?.comissaoCents ?? 0
    ),
    totalCostCents: clampInt(raw?.totalCostCents ?? raw?.totalCents ?? 0),

    costPerKiloCents: clampInt(
      raw?.costPerKiloCents ?? raw?.custoMilheiroCents ?? 0
    ),
    targetPerKiloCents: clampInt(
      raw?.targetPerKiloCents ?? raw?.metaMilheiroCents ?? 0
    ),

    expectedLatamPoints: raw?.expectedLatamPoints ?? raw?.saldoPrevistoLatam ?? null,
    expectedSmilesPoints:
      raw?.expectedSmilesPoints ?? raw?.saldoPrevistoSmiles ?? null,
    expectedLiveloPoints:
      raw?.expectedLiveloPoints ?? raw?.saldoPrevistoLivelo ?? null,
    expectedEsferaPoints:
      raw?.expectedEsferaPoints ?? raw?.saldoPrevistoEsfera ?? null,

    note: raw?.note ?? raw?.observacao ?? null,

    items,
  };

  // defaults pelo cedente (se tiver)
  if (cedenteSel) {
    if (d.expectedLatamPoints === null || d.expectedLatamPoints === undefined)
      d.expectedLatamPoints = cedenteSel.pontosLatam ?? 0;
    if (d.expectedSmilesPoints === null || d.expectedSmilesPoints === undefined)
      d.expectedSmilesPoints = cedenteSel.pontosSmiles ?? 0;
    if (d.expectedLiveloPoints === null || d.expectedLiveloPoints === undefined)
      d.expectedLiveloPoints = cedenteSel.pontosLivelo ?? 0;
    if (d.expectedEsferaPoints === null || d.expectedEsferaPoints === undefined)
      d.expectedEsferaPoints = cedenteSel.pontosEsfera ?? 0;
  }

  return d;
}

export default function NovaCompraClient({ purchaseId }: { purchaseId?: string }) {
  // ✅ pega /.../[id] quando existir (e mantém compatível com prop purchaseId)
  const params = useParams() as Record<string, string | string[] | undefined>;
  const routeIdRaw = params?.id;
  const routeId = Array.isArray(routeIdRaw) ? routeIdRaw[0] : routeIdRaw;
  const purchaseIdFinal = purchaseId || routeId;

  const [query, setQuery] = useState("");
  const [allCedentes, setAllCedentes] = useState<Cedente[]>([]);
  const [cedenteSel, setCedenteSel] = useState<Cedente | null>(null);
  const [loadingCed, setLoadingCed] = useState(false);

  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  const [itemsAllowManualFinal, setItemsAllowManualFinal] = useState<
    Record<string, boolean>
  >({});
  const [expectedAuto, setExpectedAuto] = useState<
    Record<LoyaltyProgram, boolean>
  >({
    LATAM: true,
    SMILES: true,
    LIVELO: true,
    ESFERA: true,
  });

  // ===== load compra existente (modo edição)
  useEffect(() => {
    if (!purchaseIdFinal) return;

    (async () => {
      try {
        setSaving(true);

        const out = await api<{ compra: any; cedente: Cedente }>(
          `/api/compras/${purchaseIdFinal}`
        );

        setCedenteSel(out.cedente);

        const p = normalizeDraft(out.compra, out.cedente);
        const totals = computeTotals(p);

        setDraft({ ...p, ...totals });
      } catch (e: any) {
        setError(e?.message || "Falha ao carregar compra.");
      } finally {
        setSaving(false);
      }
    })();
  }, [purchaseIdFinal]);

  // ===== load cedentes
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoadingCed(true);
      try {
        const out = await api<{ ok: true; data: Cedente[] }>(
          `/api/cedentes/approved`
        );
        if (!alive) return;
        setAllCedentes(Array.isArray(out?.data) ? out.data : []);
      } catch (e: any) {
        console.error("Falha ao carregar cedentes aprovados:", e);
        if (!alive) return;
        setAllCedentes([]);
      } finally {
        if (alive) setLoadingCed(false);
      }
    };

    load();
    return () => {
      alive = false;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const cedentes = useMemo(() => {
    const s = norm(query);
    if (s.length < 2) return [];

    const dig = onlyDigits(query);

    return allCedentes
      .filter((c) => {
        const nome = norm(c.nomeCompleto);
        const ident = norm(c.identificador);
        const cpfDig = onlyDigits(c.cpf);

        if (dig.length >= 2) {
          return (
            cpfDig.includes(dig) ||
            onlyDigits(c.identificador).includes(dig) ||
            nome.includes(s) ||
            ident.includes(s)
          );
        }

        return nome.includes(s) || ident.includes(s) || cpfDig.includes(s);
      })
      .slice(0, 30);
  }, [allCedentes, query]);

  async function createDraft() {
    if (!cedenteSel) return;
    setError(null);
    setSaving(true);

    try {
      const out = await api<{ ok: true; compra: any }>(`/api/compras`, {
        method: "POST",
        body: JSON.stringify({ cedenteId: cedenteSel.id }),
      });

      const p = normalizeDraft(out.compra, cedenteSel);
      const totals = computeTotals(p);

      setDraft({ ...p, ...totals });
    } catch (e: any) {
      setError(e?.message || "Falha ao criar compra.");
    } finally {
      setSaving(false);
    }
  }

  function scheduleAutosave(next: PurchaseDraft) {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveDraft(next);
    }, 650);
  }

  async function saveDraft(nextDraft?: PurchaseDraft, silent?: boolean) {
    const d0 = nextDraft || draft;
    if (!d0) return;

    const d = normalizeDraft(d0, cedenteSel);

    setError(null);
    if (!silent) setSaving(true);

    try {
      const totals = computeTotals(d);
      const payload = { ...d, ...totals };

      setDraft(payload);

      await api<{ ok: true }>(`/api/compras/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ciaProgram: payload.ciaProgram,
          ciaPointsTotal: payload.ciaPointsTotal,

          cedentePayCents: payload.cedentePayCents,
          vendorCommissionBps: payload.vendorCommissionBps,
          targetMarkupCents: payload.targetMarkupCents,

          note: payload.note,

          expectedLatamPoints: payload.expectedLatamPoints,
          expectedSmilesPoints: payload.expectedSmilesPoints,
          expectedLiveloPoints: payload.expectedLiveloPoints,
          expectedEsferaPoints: payload.expectedEsferaPoints,

          items: payload.items,

          subtotalCostCents: payload.subtotalCostCents,
          vendorCommissionCents: payload.vendorCommissionCents,
          totalCostCents: payload.totalCostCents,
          costPerKiloCents: payload.costPerKiloCents,
          targetPerKiloCents: payload.targetPerKiloCents,
        }),
      });
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar.");
    } finally {
      if (!silent) setSaving(false);
    }
  }

  async function releasePurchase() {
    if (!draft) return;
    setError(null);
    setSaving(true);

    try {
      await saveDraft(draft, true);

      const out = await api<{ ok: true; compra: any }>(
        `/api/compras/${draft.id}/liberar`,
        {
          method: "POST",
          body: JSON.stringify({
            saldosAplicados: {
              latam: draft.expectedLatamPoints ?? undefined,
              smiles: draft.expectedSmilesPoints ?? undefined,
              livelo: draft.expectedLiveloPoints ?? undefined,
              esfera: draft.expectedEsferaPoints ?? undefined,
            },
          }),
        }
      );

      const p2 = normalizeDraft(out.compra, cedenteSel);
      const totals2 = computeTotals(p2);

      setDraft({ ...p2, ...totals2 });
    } catch (e: any) {
      setError(e?.message || "Falha ao liberar.");
    } finally {
      setSaving(false);
    }
  }

  const isReleased = draft?.status === "CLOSED";

  const totals = useMemo(() => {
    if (!draft) return null;
    return computeTotals(draft);
  }, [draft]);

  function updateDraft(patch: Partial<PurchaseDraft>) {
    if (!draft) return;
    const next = normalizeDraft({ ...draft, ...patch }, cedenteSel);
    const t = computeTotals(next);
    const merged = { ...next, ...t };
    setDraft(merged);
    scheduleAutosave(merged);
  }

  const clubItems = useMemo(() => {
    if (!draft) return [];
    const arr = Array.isArray(draft.items) ? draft.items : [];
    return arr.filter((i) => i.type === "CLUB");
  }, [draft]);

  const otherItems = useMemo(() => {
    if (!draft) return [];
    const arr = Array.isArray(draft.items) ? draft.items : [];
    return arr.filter((i) => i.type !== "CLUB");
  }, [draft]);

  function makeKey(it: PurchaseItem, idx: number) {
    return it.id || `idx_${idx}`;
  }

  function addTransferItem() {
    if (!draft) return;

    const nextItem: PurchaseItem = {
      type: "TRANSFER",
      title: "Transferência",
      details: "",
      programFrom: "LIVELO",
      programTo: "SMILES",
      pointsBase: 0,
      bonusMode: "PERCENT",
      bonusValue: 0,
      pointsFinal: 0,
      transferMode: "FULL_POINTS",
      pointsDebitedFromOrigin: 0,
      amountCents: 0,
    };

    updateDraft({ items: [...(draft.items ?? []), nextItem] });
  }

  function addClub() {
    if (!draft) return;

    const meta: ClubMeta = {
      program: "LIVELO",
      tierK: 10,
      priceCents: 0,
      renewalDay: new Date().getDate(),
      startDateISO: isoToday(),
      bonusPoints: 0,
    };

    const item: PurchaseItem = {
      type: "CLUB",
      title: `Clube ${PROGRAM_LABEL[meta.program]} ${meta.tierK}k`,
      details: JSON.stringify(meta),
      programFrom: null,
      programTo: meta.program,
      pointsBase: meta.tierK * 1000,
      bonusMode: "TOTAL",
      bonusValue: meta.bonusPoints,
      pointsFinal: meta.tierK * 1000 + Math.max(0, clampInt(meta.bonusPoints)),
      transferMode: null,
      pointsDebitedFromOrigin: 0,
      amountCents: meta.priceCents,
    };

    updateDraft({ items: [...(draft.items ?? []), item] });
  }

  function removeItemByIndex(realIdx: number) {
    if (!draft) return;
    const items = [...(draft.items ?? [])];
    items.splice(realIdx, 1);
    updateDraft({ items });
  }

  function updateItem(realIdx: number, patch: Partial<PurchaseItem>) {
    if (!draft) return;

    const items = [...(draft.items ?? [])];
    const cur = items[realIdx] || normalizeItem({});
    const merged: PurchaseItem = normalizeItem({ ...cur, ...patch });

    const canAuto =
      merged.type === "TRANSFER" ||
      merged.type === "POINTS_BUY" ||
      merged.type === "ADJUSTMENT" ||
      merged.type === "CLUB";

    const key = merged.id || `idx_${realIdx}`;
    const allowManual = !!itemsAllowManualFinal[key];

    if (canAuto && !allowManual) {
      merged.pointsFinal = calcItemPointsFinal(merged);
    }

    if (merged.type === "CLUB") {
      const meta = safeJsonParse<ClubMeta>(merged.details) || null;
      if (meta) {
        const bonusPoints = Math.max(0, clampInt(meta.bonusPoints ?? 0));
        const pointsBase = Math.max(0, clampInt(meta.tierK) * 1000);
        merged.title = `Clube ${PROGRAM_LABEL[meta.program]} ${meta.tierK}k`;
        merged.programTo = meta.program;
        merged.pointsBase = pointsBase;
        merged.bonusMode = "TOTAL";
        merged.bonusValue = bonusPoints;
        merged.pointsFinal = allowManual
          ? merged.pointsFinal
          : calcItemPointsFinal({
              ...merged,
              pointsBase,
              bonusMode: "TOTAL",
              bonusValue: bonusPoints,
            });
        merged.amountCents = meta.priceCents;
      }
    }

    items[realIdx] = merged;
    updateDraft({ items });
  }

  // Auto: ciaPointsTotal = soma itens programTo=CIA (se estiver 0)
  useEffect(() => {
    if (!draft || !draft.ciaProgram || isReleased) return;
    if ((draft.ciaPointsTotal || 0) > 0) return;

    const itemsArr = Array.isArray(draft.items) ? draft.items : [];
    const sum = itemsArr
      .filter((it) => it.programTo === draft.ciaProgram)
      .reduce((acc, it) => acc + (it.pointsFinal || 0), 0);

    if (sum > 0) updateDraft({ ciaPointsTotal: sum });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.ciaProgram, draft?.items, isReleased]);

  const computedExpected = useMemo(() => {
    if (!cedenteSel || !draft) return null;

    const deltas = computeProgramDeltas(draft.items ?? []);

    return {
      LATAM: (cedenteSel.pontosLatam || 0) + deltas.LATAM,
      SMILES: (cedenteSel.pontosSmiles || 0) + deltas.SMILES,
      LIVELO: (cedenteSel.pontosLivelo || 0) + deltas.LIVELO,
      ESFERA: (cedenteSel.pontosEsfera || 0) + deltas.ESFERA,
      deltas,
    };
  }, [cedenteSel, draft]);

  useEffect(() => {
    if (!draft || !cedenteSel || !computedExpected || isReleased) return;

    const patch: Partial<PurchaseDraft> = {};

    if (expectedAuto.LATAM) patch.expectedLatamPoints = computedExpected.LATAM;
    if (expectedAuto.SMILES) patch.expectedSmilesPoints = computedExpected.SMILES;
    if (expectedAuto.LIVELO) patch.expectedLiveloPoints = computedExpected.LIVELO;
    if (expectedAuto.ESFERA) patch.expectedEsferaPoints = computedExpected.ESFERA;

    const changed =
      (expectedAuto.LATAM &&
        draft.expectedLatamPoints !== patch.expectedLatamPoints) ||
      (expectedAuto.SMILES &&
        draft.expectedSmilesPoints !== patch.expectedSmilesPoints) ||
      (expectedAuto.LIVELO &&
        draft.expectedLiveloPoints !== patch.expectedLiveloPoints) ||
      (expectedAuto.ESFERA &&
        draft.expectedEsferaPoints !== patch.expectedEsferaPoints);

    if (changed) updateDraft(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedExpected, expectedAuto, isReleased]);

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-4 pb-10 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 shadow-sm">
            <Receipt className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} aria-hidden />
            Gestão de pontos
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Nova compra</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Crie a compra em rascunho com autosave. Os saldos do cedente só mudam ao{" "}
              <span className="font-semibold text-slate-800">liberar</span>.
            </p>
          </div>

          {draft && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
                <span className="text-slate-500">Compra</span>
                <span className="font-mono text-slate-900">{draft.numero}</span>
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                  draft.status === "CLOSED"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                )}
              >
                Status <span className="font-mono">{draft.status}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                {saving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden />
                    Salvando…
                  </>
                ) : (
                  "Autosave ativo"
                )}
              </span>
            </div>
          )}
        </div>

        {draft && (
          <DraftActions
            draft={draft}
            saving={saving}
            isReleased={!!isReleased}
            onSave={() => void saveDraft(draft)}
            onRelease={releasePurchase}
          />
        )}
      </div>

      {error && (
        <div
          className="flex gap-3 rounded-2xl border border-rose-200/90 bg-rose-50/90 p-4 text-sm text-rose-800 shadow-sm"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" strokeWidth={2} aria-hidden />
          <p className="min-w-0 leading-relaxed">{error}</p>
        </div>
      )}

      <StepSection
        step={1}
        title="Cedente"
        hint="Busque por nome, CPF ou identificador. Depois gere o rascunho com ID único."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <label className={FIELD_LABEL}>Buscar cedente</label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={cn(CONTROL_INPUT, "pl-10")}
                placeholder="Nome, CPF, identificador…"
                disabled={!!draft}
              />
            </div>

            {loadingCed && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Carregando cedentes aprovados…
              </div>
            )}

            {!draft &&
              query.trim().length >= 2 &&
              cedentes.length === 0 &&
              !loadingCed && (
                <p className="text-xs text-slate-500">Nenhum cedente encontrado para esta busca.</p>
              )}

            {!draft && cedentes.length > 0 && (
              <div className="mt-1 max-h-60 overflow-auto rounded-xl border border-slate-200/90 bg-white shadow-inner shadow-slate-100/80">
                {cedentes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCedenteSel(c)}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left text-sm transition last:border-b-0 hover:bg-slate-50/90",
                      cedenteSel?.id === c.id && "bg-sky-50/80 hover:bg-sky-50/80"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{c.nomeCompleto}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        CPF {c.cpf} · ID {c.identificador}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-slate-500">
                      <div
                        className={cn(
                          "mb-1 inline-flex rounded-full border px-2 py-0.5 font-medium",
                          scoreBadgeClass(c.scoreMedia)
                        )}
                      >
                        Score {fmtScore(c.scoreMedia)}
                      </div>
                      <div className="tabular-nums">LATAM {c.pontosLatam}</div>
                      <div className="tabular-nums">Smiles {c.pontosSmiles}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <UserRound className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden />
              Selecionado
            </div>

            {!cedenteSel && (
              <p className="mt-3 text-sm text-slate-500">Nenhum cedente selecionado ainda.</p>
            )}

            {cedenteSel && (
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">{cedenteSel.nomeCompleto}</div>
                <div className="text-xs text-slate-500">
                  CPF {cedenteSel.cpf} · {cedenteSel.identificador}
                </div>
                <div>
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      scoreBadgeClass(cedenteSel.scoreMedia)
                    )}
                  >
                    Score médio {fmtScore(cedenteSel.scoreMedia)}/10
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  Saldos atuais: LATAM {cedenteSel.pontosLatam.toLocaleString("pt-BR")} · Smiles{" "}
                  {cedenteSel.pontosSmiles.toLocaleString("pt-BR")} · Livelo{" "}
                  {cedenteSel.pontosLivelo.toLocaleString("pt-BR")} · Esfera{" "}
                  {cedenteSel.pontosEsfera.toLocaleString("pt-BR")}
                </p>
              </div>
            )}

            <div className="mt-5">
              <button
                type="button"
                onClick={createDraft}
                disabled={!cedenteSel || saving || !!draft}
                className={BTN_PRIMARY}
              >
                {saving && !draft ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
                )}
                {draft ? "Rascunho criado" : "Gerar compra (ID único)"}
              </button>
            </div>
          </div>
        </div>
      </StepSection>

      {draft && (
        <StepSection
          step={2}
          title="Configuração e resumo"
          hint="Taxa do cedente, comissão e markup. À direita, totais e milheiro (CIA na etapa 5)."
        >
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-3 space-y-1.5">
                  <label className={FIELD_LABEL}>Observação</label>
                  <input
                    value={draft.note || ""}
                    disabled={!!isReleased}
                    onChange={(e) => updateDraft({ note: e.target.value })}
                    className={CONTROL_INPUT}
                    placeholder="Opcional"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className={FIELD_LABEL}>Taxa cedente (R$)</label>
                  <input
                    type="number"
                    value={draft.cedentePayCents / 100}
                    disabled={!!isReleased}
                    onChange={(e) =>
                      updateDraft({
                        cedentePayCents: roundCents(Number(e.target.value || 0) * 100),
                      })
                    }
                    className={CONTROL_INPUT_MONO}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className={FIELD_LABEL}>Comissão vendedor (%)</label>
                  <input
                    type="number"
                    value={draft.vendorCommissionBps / 100}
                    disabled={!!isReleased}
                    onChange={(e) =>
                      updateDraft({
                        vendorCommissionBps: roundCents(Number(e.target.value || 0) * 100),
                      })
                    }
                    className={CONTROL_INPUT_MONO}
                    placeholder="1 = 1%"
                  />
                  <p className="text-[11px] text-slate-500">Interno em bps — 1 equivale a 1%.</p>
                </div>

                <div className="space-y-1.5">
                  <label className={FIELD_LABEL}>Markup meta (R$/milheiro)</label>
                  <input
                    type="number"
                    value={draft.targetMarkupCents / 100}
                    disabled={!!isReleased}
                    onChange={(e) =>
                      updateDraft({
                        targetMarkupCents: roundCents(Number(e.target.value || 0) * 100),
                      })
                    }
                    className={CONTROL_INPUT_MONO}
                    placeholder="Ex.: 1,50"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 lg:sticky lg:top-4 h-fit shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Wallet className="h-4 w-4 text-slate-400" strokeWidth={2} aria-hidden />
                Resumo
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm space-y-2">
                <Row label="Subtotal" value={fmtMoneyBR(totals?.subtotalCostCents || 0)} />
                <Row label="Comissão" value={fmtMoneyBR(totals?.vendorCommissionCents || 0)} />
                <div className="h-px bg-slate-200/90 my-2" />
                <Row label="Total" value={fmtMoneyBR(totals?.totalCostCents || 0)} bold />
                <div className="h-px bg-slate-200/90 my-2" />
                <Row label="Milheiro" value={fmtMoneyBR(totals?.costPerKiloCents || 0)} bold />
                <Row label="Meta" value={fmtMoneyBR(totals?.targetPerKiloCents || 0)} bold />
              </div>

              <p className="text-xs leading-relaxed text-slate-500">
                O milheiro usa o <span className="font-medium text-slate-700">esperado</span> da CIA
                escolhida na etapa 5.
              </p>
            </div>
          </div>
        </StepSection>
      )}

      {draft && (
        <StepSection
          step={3}
          title="Clubes (assinaturas)"
          hint="Itens CLUB entram no custo; bônus em milhas soma ao total do item."
          action={
            <button type="button" onClick={addClub} disabled={!!isReleased} className={BTN_PRIMARY}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
              Adicionar clube
            </button>
          }
        >
          {clubItems.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-600">
              Nenhum clube nesta compra.
            </div>
          )}

          {clubItems.length > 0 && (
            <div className="overflow-auto rounded-xl border border-slate-200/80 bg-white shadow-sm">
              <table className="min-w-[900px] w-full text-sm">
                <thead className={TABLE_HEAD}>
                  <tr>
                    <th className="p-3">Programa</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Valor (R$)</th>
                    <th className="p-3">Renova (dia)</th>
                    <th className="p-3">Data assinatura</th>
                    <th className="p-3">Base pts/mês</th>
                    <th className="p-3">Bônus (milhas)</th>
                    <th className="p-3">Total pts/mês</th>
                    <th className="p-3 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {(draft.items ?? []).map((it, realIdx) => {
                    if (it.type !== "CLUB") return null;

                    const bonusFromItem =
                      (it.bonusMode === "TOTAL" ? clampInt(it.bonusValue || 0) : 0) || 0;

                    const parsedMeta = safeJsonParse<ClubMeta>(it.details);
                    const meta = parsedMeta
                      ? {
                          ...parsedMeta,
                          bonusPoints: Math.max(
                            0,
                            clampInt(parsedMeta.bonusPoints ?? bonusFromItem)
                          ),
                        }
                      : {
                          program: (it.programTo || "LIVELO") as LoyaltyProgram,
                          tierK:
                            Math.max(
                              1,
                              Math.round((it.pointsFinal || 0) / 1000) || 10
                            ) || 10,
                          priceCents: it.amountCents || 0,
                          renewalDay: new Date().getDate(),
                          startDateISO: isoToday(),
                          bonusPoints: Math.max(0, bonusFromItem),
                        };

                    return (
                      <tr
                        key={realIdx}
                        className="border-t border-slate-100 bg-white/60 transition hover:bg-slate-50/80"
                      >
                        <td className="p-3 align-middle">
                          <select
                            value={meta.program}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const next: ClubMeta = {
                                ...meta,
                                program: e.target.value as LoyaltyProgram,
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                                programTo: next.program,
                              });
                            }}
                            className={CONTROL_SELECT_SM}
                          >
                            <option value="LIVELO">Livelo</option>
                            <option value="SMILES">Smiles</option>
                            <option value="LATAM">LATAM</option>
                            <option value="ESFERA">Esfera</option>
                          </select>
                        </td>

                        <td className="p-3 align-middle">
                          <select
                            value={meta.tierK}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const next: ClubMeta = {
                                ...meta,
                                tierK: clampInt(e.target.value),
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                                pointsBase: next.tierK * 1000,
                                pointsFinal: next.tierK * 1000,
                              });
                            }}
                            className={CONTROL_SELECT_SM}
                          >
                            {CLUB_TIERS.map((k) => (
                              <option key={k} value={k}>
                                {k}k
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="p-3 align-middle">
                          <input
                            type="number"
                            value={(meta.priceCents || 0) / 100}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const cents = roundCents(
                                Number(e.target.value || 0) * 100
                              );
                              const next: ClubMeta = {
                                ...meta,
                                priceCents: cents,
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                                amountCents: cents,
                              });
                            }}
                            className={CONTROL_INPUT_MONO}
                          />
                        </td>

                        <td className="p-3 align-middle">
                          <input
                            type="number"
                            value={meta.renewalDay}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const next: ClubMeta = {
                                ...meta,
                                renewalDay: clampDay(e.target.value),
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                              });
                            }}
                            className={CONTROL_INPUT_MONO}
                          />
                        </td>

                        <td className="p-3 align-middle">
                          <input
                            type="date"
                            value={meta.startDateISO}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const next: ClubMeta = {
                                ...meta,
                                startDateISO: e.target.value || isoToday(),
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                              });
                            }}
                            className={cn(CONTROL_INPUT, "py-2 text-[13px]")}
                          />
                        </td>

                        <td className="p-3 font-mono text-sm tabular-nums text-slate-800">
                          {meta.tierK * 1000}
                        </td>

                        <td className="p-3 align-middle">
                          <input
                            type="number"
                            min={0}
                            value={Math.max(0, clampInt(meta.bonusPoints || 0))}
                            disabled={!!isReleased}
                            onChange={(e) => {
                              const bonusPoints = Math.max(
                                0,
                                clampInt(e.target.value || 0)
                              );
                              const next: ClubMeta = {
                                ...meta,
                                bonusPoints,
                              };
                              updateItem(realIdx, {
                                details: JSON.stringify(next),
                                bonusMode: "TOTAL",
                                bonusValue: bonusPoints,
                                pointsFinal: calcItemPointsFinal({
                                  ...it,
                                  pointsBase: next.tierK * 1000,
                                  bonusMode: "TOTAL",
                                  bonusValue: bonusPoints,
                                }),
                              });
                            }}
                            className={CONTROL_INPUT_MONO}
                          />
                        </td>

                        <td className="p-3 font-mono text-sm tabular-nums text-slate-900">
                          {Math.max(0, clampInt(it.pointsFinal || 0)).toLocaleString("pt-BR")}
                        </td>

                        <td className="p-3 align-middle">
                          <button
                            type="button"
                            onClick={() => removeItemByIndex(realIdx)}
                            disabled={!!isReleased}
                            className={cn(
                              BTN_GHOST,
                              "h-8 text-rose-700 border-rose-200 hover:bg-rose-50"
                            )}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            Remover
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-4 text-xs leading-relaxed text-slate-600">
            Clubes são itens <span className="font-semibold text-slate-800">CLUB</span>: entram no
            custo total e o bônus em milhas soma aos pontos do item.
          </p>
        </StepSection>
      )}

      {draft && (
        <StepSection
          step={4}
          title="Itens (pontos e custos)"
          hint="Transferências, compras de pontos, ajustes e custos extras — cada item em um cartão legível."
          action={
            <button
              type="button"
              onClick={addTransferItem}
              disabled={!!isReleased}
              className={BTN_PRIMARY}
            >
              <Package className="h-4 w-4" strokeWidth={2} aria-hidden />
              Adicionar item
            </button>
          }
        >
          {otherItems.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-sm text-slate-600">
              Sem itens além de clubes. Adicione transferências ou custos quando precisar.
            </div>
          )}

          {otherItems.length > 0 && (
            <div className="space-y-4">
              {(draft.items ?? []).map((it, realIdx) => {
                if (it.type === "CLUB") return null;

                const key = makeKey(it, realIdx);
                const allowManual = !!itemsAllowManualFinal[key];

                return (
                  <ItemCard
                    key={key}
                    it={it}
                    realIdx={realIdx}
                    allowManual={allowManual}
                    isReleased={!!isReleased}
                    onUpdateItem={updateItem}
                    onRemoveItem={removeItemByIndex}
                    onToggleAllowManual={(v) =>
                      setItemsAllowManualFinal((s) => ({ ...s, [key]: v }))
                    }
                  />
                );
              })}
            </div>
          )}

          <p className="mt-4 text-xs leading-relaxed text-slate-600">
            O milheiro na etapa 5 usa o <span className="font-medium text-slate-800">esperado</span>{" "}
            da CIA (LATAM ou Smiles).
          </p>
        </StepSection>
      )}

      {draft && cedenteSel && (
        <StepSection
          step={5}
          title="Saldo esperado e CIA (milheiro)"
          hint="Marque Auto para recalcular a partir do saldo atual + itens. Ao liberar, o cedente passa a ter exatamente estes saldos."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label className={FIELD_LABEL}>CIA base (milheiro)</label>
              <select
                value={draft.ciaProgram || ""}
                disabled={!!isReleased}
                onChange={(e) =>
                  updateDraft({
                    ciaProgram: (e.target.value || null) as LoyaltyProgram | null,
                  })
                }
                className={CONTROL_SELECT}
              >
                <option value="">Selecione…</option>
                <option value="LATAM">LATAM</option>
                <option value="SMILES">Smiles</option>
              </select>
              <p className="text-[11px] text-slate-500">
                O milheiro usa o esperado da CIA escolhida.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
              <div className={FIELD_LABEL}>Pontos no milheiro</div>
              <div className="mt-1 text-lg font-bold tabular-nums tracking-tight text-slate-900">
                {Math.max(0, pointsForMilheiro(draft)).toLocaleString("pt-BR")}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Fonte:{" "}
                {draft.ciaProgram === "LATAM"
                  ? "Esperado LATAM"
                  : draft.ciaProgram === "SMILES"
                    ? "Esperado Smiles"
                    : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
              <div className={FIELD_LABEL}>Milheiro (CIA)</div>
              <div className="mt-1 text-lg font-bold tabular-nums tracking-tight text-slate-900">
                {fmtMoneyBR(totals?.costPerKiloCents || 0)}
              </div>
              <p className="mt-1 text-xs text-slate-500">Baseado no esperado da CIA.</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ExpectedBalance
              label="LATAM"
              program="LATAM"
              current={cedenteSel.pontosLatam}
              delta={computedExpected?.deltas.LATAM || 0}
              value={draft.expectedLatamPoints}
              auto={expectedAuto.LATAM}
              disabled={!!isReleased}
              onToggleAuto={(v) => setExpectedAuto((s) => ({ ...s, LATAM: v }))}
              onChange={(v) => updateDraft({ expectedLatamPoints: v })}
            />
            <ExpectedBalance
              label="Smiles"
              program="SMILES"
              current={cedenteSel.pontosSmiles}
              delta={computedExpected?.deltas.SMILES || 0}
              value={draft.expectedSmilesPoints}
              auto={expectedAuto.SMILES}
              disabled={!!isReleased}
              onToggleAuto={(v) => setExpectedAuto((s) => ({ ...s, SMILES: v }))}
              onChange={(v) => updateDraft({ expectedSmilesPoints: v })}
            />
            <ExpectedBalance
              label="Livelo"
              program="LIVELO"
              current={cedenteSel.pontosLivelo}
              delta={computedExpected?.deltas.LIVELO || 0}
              value={draft.expectedLiveloPoints}
              auto={expectedAuto.LIVELO}
              disabled={!!isReleased}
              onToggleAuto={(v) => setExpectedAuto((s) => ({ ...s, LIVELO: v }))}
              onChange={(v) => updateDraft({ expectedLiveloPoints: v })}
            />
            <ExpectedBalance
              label="Esfera"
              program="ESFERA"
              current={cedenteSel.pontosEsfera}
              delta={computedExpected?.deltas.ESFERA || 0}
              value={draft.expectedEsferaPoints}
              auto={expectedAuto.ESFERA}
              disabled={!!isReleased}
              onToggleAuto={(v) => setExpectedAuto((s) => ({ ...s, ESFERA: v }))}
              onChange={(v) => updateDraft({ expectedEsferaPoints: v })}
            />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-600">
            Ao <span className="font-semibold text-slate-800">liberar</span>, os pontos do cedente
            serão atualizados para os valores em <span className="font-medium">Esperado</span>.
          </p>
        </StepSection>
      )}

      {draft && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          )}
          <span>
            {saving ? "Salvando alterações…" : "Autosave ativo (~0,65 s após editar)."}
            {draft.status === "CLOSED" ? " Compra liberada (somente leitura)." : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function DraftActions(props: {
  draft: PurchaseDraft;
  saving: boolean;
  isReleased: boolean;
  onSave: () => void;
  onRelease: () => void;
}) {
  const { draft, saving, isReleased, onSave, onRelease } = props;

  const ptsMilheiro = pointsForMilheiro(draft);
  const releaseDisabled =
    isReleased || saving || !draft.ciaProgram || !ptsMilheiro || ptsMilheiro <= 0;

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || isReleased}
        className={BTN_SECONDARY}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden />
        ) : (
          <Save className="h-4 w-4 text-slate-500" strokeWidth={2} aria-hidden />
        )}
        Salvar agora
      </button>

      <button type="button" onClick={onRelease} disabled={releaseDisabled} className={BTN_EMERALD}>
        <Unlock className="h-4 w-4" strokeWidth={2} aria-hidden />
        Liberar (aplicar saldo)
      </button>
    </div>
  );
}

function Row(props: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-600">{props.label}</span>
      <span
        className={cn(
          "tabular-nums text-slate-900",
          props.bold && "font-semibold tracking-tight"
        )}
      >
        {props.value}
      </span>
    </div>
  );
}

function ExpectedBalance(props: {
  label: string;
  program: LoyaltyProgram;
  current: number;
  delta: number;
  value: number | null;
  auto: boolean;
  disabled?: boolean;
  onToggleAuto: (v: boolean) => void;
  onChange: (v: number | null) => void;
}) {
  const { label, current, delta, value, auto, disabled, onToggleAuto, onChange } =
    props;

  const signedDelta =
    delta === 0
      ? "0"
      : delta > 0
      ? `+${delta.toLocaleString("pt-BR")}`
      : `${delta.toLocaleString("pt-BR")}`;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium text-slate-600">
          <input
            type="checkbox"
            checked={auto}
            disabled={disabled}
            onChange={(e) => onToggleAuto(e.target.checked)}
            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
          />
          Auto
        </label>
      </div>

      <div className="mt-2 text-xs text-slate-600">
        Atual:{" "}
        <span className="font-semibold tabular-nums text-slate-900">
          {current.toLocaleString("pt-BR")}
        </span>
      </div>

      <div className="text-xs text-slate-600">
        Delta:{" "}
        <span
          className={cn(
            "font-semibold tabular-nums",
            delta >= 0 ? "text-emerald-700" : "text-rose-700"
          )}
        >
          {signedDelta}
        </span>
      </div>

      <label className={cn(FIELD_LABEL, "mt-3 block")}>Esperado</label>
      <input
        type="number"
        value={value ?? ""}
        disabled={disabled || auto}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? Math.trunc(n) : 0);
        }}
        className={cn(CONTROL_INPUT_MONO, "mt-1.5 disabled:opacity-50")}
        placeholder="Ex.: 150000"
      />
      {auto && <p className="mt-1.5 text-[11px] text-slate-500">Calculado automaticamente.</p>}
    </div>
  );
}

/* =========================
   NOVO: ItemCard (Etapa 4)
   ========================= */
function ItemCard(props: {
  it: PurchaseItem;
  realIdx: number;
  allowManual: boolean;
  isReleased: boolean;
  onUpdateItem: (realIdx: number, patch: Partial<PurchaseItem>) => void;
  onRemoveItem: (realIdx: number) => void;
  onToggleAllowManual: (v: boolean) => void;
}) {
  const { it, realIdx, allowManual, isReleased, onUpdateItem, onRemoveItem, onToggleAllowManual } =
    props;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[220px] space-y-1">
          <label className={FIELD_LABEL}>Tipo</label>
          <select
            value={it.type}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, { type: e.target.value as PurchaseItemType })
            }
            className={CONTROL_SELECT}
          >
            <option value="TRANSFER">Transferência</option>
            <option value="POINTS_BUY">Compra pontos</option>
            <option value="ADJUSTMENT">Ajuste</option>
            <option value="EXTRA_COST">Extra</option>
          </select>
        </div>

        <div className="min-w-[280px] flex-1 space-y-2">
          <div className="space-y-1">
            <label className={FIELD_LABEL}>Título</label>
            <input
              value={it.title}
              disabled={isReleased}
              onChange={(e) => onUpdateItem(realIdx, { title: e.target.value })}
              className={CONTROL_INPUT}
              placeholder="Ex.: Transferência Livelo → Smiles"
            />
          </div>
          <div className="space-y-1">
            <label className={FIELD_LABEL}>Detalhes (opcional)</label>
            <input
              value={it.details || ""}
              disabled={isReleased}
              onChange={(e) => onUpdateItem(realIdx, { details: e.target.value })}
              className={CONTROL_INPUT}
              placeholder="Campanha, ID do pedido, observações…"
            />
          </div>
        </div>

        <div className="min-w-[200px] space-y-2">
          <div className="space-y-1">
            <label className={FIELD_LABEL}>Custo (R$)</label>
            <input
              type="number"
              value={(it.amountCents || 0) / 100}
              disabled={isReleased}
              onChange={(e) =>
                onUpdateItem(realIdx, {
                  amountCents: roundCents(Number(e.target.value || 0) * 100),
                })
              }
              className={CONTROL_INPUT_MONO}
            />
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => onRemoveItem(realIdx)}
              disabled={isReleased}
              className={cn(BTN_GHOST, "text-rose-700 border-rose-200 hover:bg-rose-50")}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Remover
            </button>
          </div>
        </div>
      </div>

      <div className="my-5 h-px bg-slate-100" />

      {/* Body grid */}
      <div className="grid gap-3 md:grid-cols-12">
        {/* De */}
        <div className="md:col-span-3 space-y-1">
          <label className={FIELD_LABEL}>De (origem)</label>
          <select
            value={it.programFrom || ""}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, {
                programFrom: (e.target.value || null) as any,
              })
            }
            className={CONTROL_SELECT}
          >
            <option value="">—</option>
            <option value="LATAM">LATAM</option>
            <option value="SMILES">SMILES</option>
            <option value="LIVELO">LIVELO</option>
            <option value="ESFERA">ESFERA</option>
          </select>
        </div>

        {/* Para */}
        <div className="md:col-span-3 space-y-1">
          <label className={FIELD_LABEL}>Para (destino)</label>
          <select
            value={it.programTo || ""}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, { programTo: (e.target.value || null) as any })
            }
            className={CONTROL_SELECT}
          >
            <option value="">—</option>
            <option value="LATAM">LATAM</option>
            <option value="SMILES">SMILES</option>
            <option value="LIVELO">LIVELO</option>
            <option value="ESFERA">ESFERA</option>
          </select>
        </div>

        {/* Base */}
        <div className="md:col-span-2 space-y-1">
          <label className={FIELD_LABEL}>Pontos base</label>
          <input
            type="number"
            value={it.pointsBase}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, { pointsBase: clampInt(e.target.value) })
            }
            className={CONTROL_INPUT_MONO}
          />
        </div>

        <div className="md:col-span-4 space-y-1">
          <label className={FIELD_LABEL}>Bônus</label>
          <div className="flex items-stretch gap-2">
            <input
              type="number"
              value={it.bonusValue ?? 0}
              disabled={isReleased || !it.bonusMode}
              onChange={(e) =>
                onUpdateItem(realIdx, { bonusValue: clampInt(e.target.value) })
              }
              className={cn(CONTROL_INPUT_MONO_FLEX, "disabled:opacity-50")}
              placeholder="0"
            />

            <select
              value={it.bonusMode || ""}
              disabled={isReleased}
              onChange={(e) =>
                onUpdateItem(realIdx, { bonusMode: e.target.value as any })
              }
              className={BONUS_MODE_SELECT_CLASS}
              title="Tipo de bônus"
            >
              <option value="">—</option>
              <option value="PERCENT">%</option>
              <option value="TOTAL">+Pts</option>
            </select>
          </div>
          <p className="text-[11px] text-slate-500">
            % sobre a base · +Pts soma valor fixo
          </p>
        </div>

        <div className="md:col-span-4 space-y-1">
          <label className={FIELD_LABEL}>Pontos final</label>
          <input
            type="number"
            value={it.pointsFinal}
            disabled={isReleased || !allowManual}
            onChange={(e) =>
              onUpdateItem(realIdx, { pointsFinal: clampInt(e.target.value) })
            }
            className={cn(CONTROL_INPUT_MONO, "disabled:opacity-50")}
          />

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700">
              <input
                type="checkbox"
                checked={allowManual}
                disabled={isReleased}
                onChange={(e) => onToggleAllowManual(e.target.checked)}
                className="rounded border-slate-300 text-slate-900"
              />
              Editar final manualmente
            </label>

            {!allowManual && (
              <span className="text-[11px] text-slate-500">Automático (base + bônus)</span>
            )}
          </div>
        </div>

        <div className="md:col-span-4 space-y-1">
          <label className={FIELD_LABEL}>Debitado na origem</label>
          <input
            type="number"
            value={it.pointsDebitedFromOrigin}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, {
                pointsDebitedFromOrigin: clampInt(e.target.value),
              })
            }
            className={CONTROL_INPUT_MONO}
            placeholder="0"
          />
          <p className="text-[11px] text-slate-500">
            Quando o destino ganha e a origem perde pontos.
          </p>
        </div>

        <div className="md:col-span-4 space-y-1">
          <label className={FIELD_LABEL}>Modo</label>
          <select
            value={it.transferMode || ""}
            disabled={isReleased}
            onChange={(e) =>
              onUpdateItem(realIdx, {
                transferMode: (e.target.value || null) as any,
              })
            }
            className={CONTROL_SELECT}
          >
            <option value="">—</option>
            <option value="FULL_POINTS">Só pontos</option>
            <option value="POINTS_PLUS_CASH">Pontos + dinheiro</option>
          </select>
          <p className="text-[11px] text-slate-500">Forma do resgate ou transferência.</p>
        </div>

        <div className="md:col-span-4 space-y-1">
          <label className={FIELD_LABEL}>Resumo</label>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">Final</span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {clampInt(it.pointsFinal).toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-slate-600">Custo</span>
              <span className="font-semibold tabular-nums text-slate-900">
                {fmtMoneyBR(it.amountCents || 0)}
              </span>
            </div>
            <div className="mt-2 text-[11px] font-medium text-slate-500">
              {it.programFrom ? PROGRAM_LABEL[it.programFrom] : "—"} →{" "}
              {it.programTo ? PROGRAM_LABEL[it.programTo] : "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
