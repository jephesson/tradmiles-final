"use client";

import { useEffect, useMemo, useState } from "react";

type Points = { latam: number; smiles: number; livelo: number; esfera: number };
type Snapshot = { id: string; date: string; cashCents: number };

function fmtMoneyBR(cents: number) {
  const v = (cents || 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtInt(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n || 0);
}

function dateBR(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

function toCentsFromInput(s: string) {
  const cleaned = (s || "").trim();
  if (!cleaned) return 0;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function centsToRateInput(cents: number) {
  // 2000 -> "20,00"
  const v = (Number(cents || 0) / 100).toFixed(2);
  return v.replace(".", ",");
}

export default function CedentesResumoClient() {
  const [loading, setLoading] = useState(false);

  const [points, setPoints] = useState<Points>({ latam: 0, smiles: 0, livelo: 0, esfera: 0 });
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [cashInput, setCashInput] = useState<string>("");

  // valores do milheiro (R$/1000)
  const [rateLatam, setRateLatam] = useState("20,00");
  const [rateSmiles, setRateSmiles] = useState("18,00");
  const [rateLivelo, setRateLivelo] = useState("22,00");
  const [rateEsfera, setRateEsfera] = useState("17,00");

  const [didLoad, setDidLoad] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/resumo", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao carregar resumo");

      setPoints(j.data.points);
      setSnapshots(j.data.snapshots);

      // caixa do dia (latest)
      const latestCents = Number(j.data.latestCashCents || 0);
      setCashInput(String((latestCents / 100).toFixed(2)).replace(".", ","));

      // ✅ rates salvos
      const rates = j.data.ratesCents;
      if (rates) {
        setRateLatam(centsToRateInput(rates.latamRateCents));
        setRateSmiles(centsToRateInput(rates.smilesRateCents));
        setRateLivelo(centsToRateInput(rates.liveloRateCents));
        setRateEsfera(centsToRateInput(rates.esferaRateCents));
      }

      setDidLoad(true);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function salvarRates() {
    const res = await fetch("/api/resumo/rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latam: rateLatam,
        smiles: rateSmiles,
        livelo: rateLivelo,
        esfera: rateEsfera,
      }),
    });
    const j = await res.json();
    if (!j?.ok) throw new Error(j?.error || "Erro ao salvar milheiros");
  }

  // ✅ autosave dos rates (debounce)
  useEffect(() => {
    if (!didLoad) return;
    const t = setTimeout(() => {
      salvarRates().catch(() => {});
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateLatam, rateSmiles, rateLivelo, rateEsfera, didLoad]);

  const calc = useMemo(() => {
    const milLatam = Math.floor((points.latam || 0) / 1000);
    const milSmiles = Math.floor((points.smiles || 0) / 1000);
    const milLivelo = Math.floor((points.livelo || 0) / 1000);
    const milEsfera = Math.floor((points.esfera || 0) / 1000);

    const rLatam = Number(String(rateLatam).replace(",", ".")) || 0;
    const rSmiles = Number(String(rateSmiles).replace(",", ".")) || 0;
    const rLivelo = Number(String(rateLivelo).replace(",", ".")) || 0;
    const rEsfera = Number(String(rateEsfera).replace(",", ".")) || 0;

    const vLatamCents = Math.round(milLatam * rLatam * 100);
    const vSmilesCents = Math.round(milSmiles * rSmiles * 100);
    const vLiveloCents = Math.round(milLivelo * rLivelo * 100);
    const vEsferaCents = Math.round(milEsfera * rEsfera * 100);

    const cashCents = toCentsFromInput(cashInput);
    const totalCents = vLatamCents + vSmilesCents + vLiveloCents + vEsferaCents + cashCents;

    return {
      milLatam,
      milSmiles,
      milLivelo,
      milEsfera,
      vLatamCents,
      vSmilesCents,
      vLiveloCents,
      vEsferaCents,
      cashCents,
      totalCents,
    };
  }, [points, rateLatam, rateSmiles, rateLivelo, rateEsfera, cashInput]);

  async function salvarCaixaHoje() {
    try {
      const res = await fetch("/api/caixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cash: cashInput }),
      });
      const j = await res.json();
      if (!j?.ok) throw new Error(j?.error || "Erro ao salvar caixa");
      await load();
      alert("✅ Caixa de hoje salvo!");
    } catch (e: any) {
      alert(e.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Resumo</h1>
          <p className="text-sm text-slate-600">
            Patrimônio estimado: milhas (por milheiro) + caixa (Inter).
          </p>
        </div>

        <button
          onClick={load}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          disabled={loading}
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="font-semibold">Milhas atuais</div>

          <div className="text-sm grid grid-cols-2 gap-2">
            <div>LATAM: <b>{fmtInt(points.latam)}</b></div>
            <div>Smiles: <b>{fmtInt(points.smiles)}</b></div>
            <div>Livelo: <b>{fmtInt(points.livelo)}</b></div>
            <div>Esfera: <b>{fmtInt(points.esfera)}</b></div>
          </div>

          <div className="text-xs text-slate-600">
            * cálculo usa milheiros inteiros (pontos/1000 arredondado para baixo).
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 space-y-3">
          <div className="font-semibold">Caixa (Inter)</div>

          <div className="flex items-center gap-3">
            <div className="w-40 text-xs text-slate-600">Saldo atual (R$)</div>
            <input
              value={cashInput}
              onChange={(e) => setCashInput(e.target.value)}
              className="flex-1 rounded-xl border px-3 py-2 text-sm"
              placeholder="Ex: 12345,67"
            />
          </div>

          <button
            onClick={salvarCaixaHoje}
            className="rounded-xl bg-black px-4 py-2 text-white text-sm hover:bg-gray-800"
          >
            Salvar caixa de hoje
          </button>

          <div className="text-xs text-slate-600">
            Isso grava/atualiza o snapshot do dia no histórico.
          </div>
        </div>
      </div>

      {/* Rates + valores */}
      <div className="rounded-2xl border bg-white p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold">Valor do milheiro (R$/1000)</div>

          <button
            onClick={async () => {
              try {
                await salvarRates();
                alert("✅ Milheiros salvos!");
              } catch (e: any) {
                alert(e.message);
              }
            }}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Salvar milheiros
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex items-center gap-3">
            <div className="w-40 text-xs text-slate-600">LATAM</div>
            <input className="flex-1 rounded-xl border px-3 py-2 text-sm" value={rateLatam} onChange={(e) => setRateLatam(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-40 text-xs text-slate-600">Smiles</div>
            <input className="flex-1 rounded-xl border px-3 py-2 text-sm" value={rateSmiles} onChange={(e) => setRateSmiles(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-40 text-xs text-slate-600">Livelo</div>
            <input className="flex-1 rounded-xl border px-3 py-2 text-sm" value={rateLivelo} onChange={(e) => setRateLivelo(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-40 text-xs text-slate-600">Esfera</div>
            <input className="flex-1 rounded-xl border px-3 py-2 text-sm" value={rateEsfera} onChange={(e) => setRateEsfera(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">LATAM</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milLatam)}</b> • Valor: <b>{fmtMoneyBR(calc.vLatamCents)}</b>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">Smiles</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milSmiles)}</b> • Valor: <b>{fmtMoneyBR(calc.vSmilesCents)}</b>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">Livelo</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milLivelo)}</b> • Valor: <b>{fmtMoneyBR(calc.vLiveloCents)}</b>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-slate-600">Esfera</div>
            <div className="text-sm">
              Milheiros: <b>{fmtInt(calc.milEsfera)}</b> • Valor: <b>{fmtMoneyBR(calc.vEsferaCents)}</b>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-slate-50 p-4">
          <div className="text-xs text-slate-600">TOTAL (milhas + caixa)</div>
          <div className="text-2xl font-bold">{fmtMoneyBR(calc.totalCents)}</div>
        </div>
      </div>

      {/* Histórico */}
      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div className="font-semibold">Histórico do caixa (por dia)</div>

        {snapshots.length === 0 ? (
          <div className="text-sm text-slate-600">Nenhum snapshot salvo ainda.</div>
        ) : (
          <div className="max-h-80 overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Dia</th>
                  <th className="px-3 py-2 text-right">Caixa</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2">{dateBR(s.date)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoneyBR(s.cashCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-xs text-slate-600">
          Se quiser “automático no fim do dia”, dá pra colocar um Cron na Vercel chamando um endpoint.
        </div>
      </div>
    </div>
  );
}
