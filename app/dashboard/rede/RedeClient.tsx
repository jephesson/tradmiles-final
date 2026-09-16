"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import {
  Loader2,
  Minus,
  Network,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ancestorsOf,
  childrenMap,
  descendantsOf,
  layoutForest,
  NODE_H,
  NODE_W,
  type LaidOutNode,
  type RedeNode,
} from "@/lib/rede/layout";

type Graph = {
  nodes: RedeNode[];
  edges: Array<{ from: string; to: string }>;
  stats: { people: number; links: number; roots: number; maxDirect: number };
};

function statusClass(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "APPROVED") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (s === "PENDING") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (s === "REJECTED") return "bg-rose-50 text-rose-800 ring-rose-200";
  return "bg-slate-50 text-slate-600 ring-slate-200";
}

function statusLabel(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "APPROVED") return "Aprovado";
  if (s === "PENDING") return "Pendente";
  if (s === "REJECTED") return "Rejeitado";
  return status || "—";
}

function connectorPath(from: LaidOutNode, to: LaidOutNode) {
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H;
  const x2 = to.x + NODE_W / 2;
  const y2 = to.y;
  const mid = y1 + (y2 - y1) / 2;
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
}

export default function RedeClient() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(0.82);
  const [pan, setPan] = useState({ x: 48, y: 48 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const surface = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/rede", { cache: "no-store", credentials: "include" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao carregar a rede.");
        if (!cancelled) setGraph(json.data as Graph);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Falha ao carregar a rede.");
          setGraph(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map((graph?.nodes || []).map((n) => [n.id, n])), [graph]);
  const kids = useMemo(() => childrenMap(graph?.nodes || []), [graph]);

  const layout = useMemo(() => layoutForest(graph?.nodes || []), [graph]);
  const placedById = useMemo(() => new Map(layout.placed.map((n) => [n.id, n])), [layout]);

  const matchIds = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    const ids = new Set<string>();
    for (const n of graph?.nodes || []) {
      const blob = `${n.nomeCompleto} ${n.identificador} ${n.ownerName}`.toLowerCase();
      if (blob.includes(needle)) ids.add(n.id);
    }
    return ids;
  }, [graph, q]);

  const highlight = useMemo(() => {
    if (selectedId) {
      const down = descendantsOf(selectedId, kids);
      const up = ancestorsOf(selectedId, byId);
      return new Set([...down, ...up]);
    }
    if (matchIds) {
      const keep = new Set<string>();
      for (const id of matchIds) {
        for (const a of ancestorsOf(id, byId)) keep.add(a);
        for (const d of descendantsOf(id, kids)) keep.add(d);
      }
      return keep;
    }
    return null;
  }, [selectedId, matchIds, kids, byId]);

  const selected = selectedId ? byId.get(selectedId) || null : null;
  const selectedChildren = selectedId ? kids.get(selectedId) || [] : [];
  const selectedParent = selected?.parentId ? byId.get(selected.parentId) || null : null;

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const next = Math.min(1.8, Math.max(0.28, scale + (e.deltaY > 0 ? -0.08 : 0.08)));
    setScale(next);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-node]")) return;
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setPan({
      x: drag.current.panX + (e.clientX - drag.current.x),
      y: drag.current.panY + (e.clientY - drag.current.y),
    });
  }

  function onPointerUp() {
    drag.current = null;
  }

  function focusNode(id: string) {
    const node = placedById.get(id);
    const box = surface.current?.getBoundingClientRect();
    if (!node || !box) {
      setSelectedId(id);
      return;
    }
    setSelectedId(id);
    setPan({
      x: box.width / 2 - (node.x + NODE_W / 2) * scale,
      y: 56 - node.y * scale,
    });
  }

  return (
    <div className="flex min-h-[calc(100vh-2rem)] flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-700">
            <Network className="h-4 w-4" strokeWidth={2} />
            Rede
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Fluxograma de indicações
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Cada seta liga quem indicou a quem entrou. Clique em um cedente para ver a ramificação
            dele e os respectivos indicados.
          </p>
        </div>
        {graph ? (
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              {graph.stats.people} na rede
            </span>
            <span className="rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-800">
              {graph.stats.links} indicações
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
              {graph.stats.roots} raízes
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex max-h-[78vh] flex-col rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-900/10"
                placeholder="Buscar nome ou ID"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {layout.roots.map((root) => {
              const count = descendantsOf(root.id, kids).size - 1;
              const hidden = highlight && !highlight.has(root.id);
              if (hidden && q.trim()) return null;
              return (
                <button
                  key={root.id}
                  type="button"
                  onClick={() => focusNode(root.id)}
                  className={cn(
                    "mb-1 w-full rounded-xl px-3 py-2 text-left text-[13px] transition",
                    selectedId === root.id
                      ? "bg-violet-50 text-violet-900 ring-1 ring-violet-200"
                      : "hover:bg-slate-50"
                  )}
                >
                  <div className="truncate font-semibold text-slate-800">{root.nomeCompleto}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {root.identificador} · {count} indicado{count === 1 ? "" : "s"}
                  </div>
                </button>
              );
            })}
            {!layout.roots.length && !loading ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500">
                Ainda não há indicações ligando cedentes.
              </div>
            ) : null}
          </div>
        </aside>

        <section className="relative min-h-[70vh] overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50 shadow-sm">
          <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
            <button
              type="button"
              className="rounded-lg p-1.5 hover:bg-slate-100"
              onClick={() => setScale((s) => Math.max(0.28, s - 0.1))}
              aria-label="Diminuir zoom"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="w-10 text-center text-[11px] font-medium text-slate-600">
              {Math.round(scale * 100)}%
            </div>
            <button
              type="button"
              className="rounded-lg p-1.5 hover:bg-slate-100"
              onClick={() => setScale((s) => Math.min(1.8, s + 0.1))}
              aria-label="Aumentar zoom"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Montando a rede…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-rose-700">
              {error}
            </div>
          ) : (
            <div
              ref={surface}
              className="h-full cursor-grab active:cursor-grabbing"
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <svg
                width="100%"
                height="100%"
                className="block h-full w-full"
              >
                <g transform={`translate(${pan.x} ${pan.y}) scale(${scale})`}>
                  {(graph?.edges || []).map((e) => {
                    const from = placedById.get(e.from);
                    const to = placedById.get(e.to);
                    if (!from || !to) return null;
                    const dim =
                      highlight && (!highlight.has(e.from) || !highlight.has(e.to));
                    return (
                      <path
                        key={`${e.from}-${e.to}`}
                        d={connectorPath(from, to)}
                        fill="none"
                        stroke={dim ? "#cbd5e1" : "#8b5cf6"}
                        strokeWidth={dim ? 1.25 : 2}
                        opacity={dim ? 0.35 : 0.9}
                      />
                    );
                  })}
                  {layout.placed.map((n) => {
                    const dim = highlight && !highlight.has(n.id);
                    const active = selectedId === n.id || matchIds?.has(n.id);
                    return (
                      <g
                        key={n.id}
                        data-node="1"
                        transform={`translate(${n.x} ${n.y})`}
                        className="cursor-pointer"
                        onClick={() => setSelectedId(n.id)}
                      >
                        <rect
                          width={NODE_W}
                          height={NODE_H}
                          rx={16}
                          fill="white"
                          stroke={active ? "#7c3aed" : "#e2e8f0"}
                          strokeWidth={active ? 2 : 1}
                          opacity={dim ? 0.28 : 1}
                          filter="drop-shadow(0 1px 2px rgba(15,23,42,0.06))"
                        />
                        <foreignObject width={NODE_W} height={NODE_H}>
                          <div className="h-full px-3 py-2.5" style={{ opacity: dim ? 0.45 : 1 }}>
                            <div className="truncate text-[13px] font-semibold text-slate-900">
                              {n.nomeCompleto}
                            </div>
                            <div className="truncate text-[11px] text-slate-500">
                              {n.identificador} · {n.ownerName}
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1",
                                  statusClass(n.status)
                                )}
                              >
                                {statusLabel(n.status)}
                              </span>
                              {n.directCount > 0 ? (
                                <span className="text-[10px] font-medium text-violet-700">
                                  {n.directCount} direto{n.directCount === 1 ? "" : "s"}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </foreignObject>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          )}

          {selected ? (
            <div className="absolute bottom-3 left-3 right-3 z-10 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-slate-900/10 backdrop-blur sm:left-auto sm:w-[360px]">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-700">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-900">{selected.nomeCompleto}</div>
                  <div className="text-[12px] text-slate-500">{selected.identificador}</div>
                </div>
                <Link
                  href={`/dashboard/cedentes/${selected.id}`}
                  className="shrink-0 text-[12px] font-medium text-violet-700 hover:underline"
                >
                  Abrir ficha
                </Link>
              </div>
              <div className="mt-3 space-y-1 text-[12px] text-slate-600">
                <div>
                  <b>Indicado por:</b>{" "}
                  {selectedParent ? (
                    <button
                      type="button"
                      className="text-violet-700 hover:underline"
                      onClick={() => focusNode(selectedParent.id)}
                    >
                      {selectedParent.nomeCompleto}
                    </button>
                  ) : (
                    "raiz da rede"
                  )}
                </div>
                <div>
                  <b>Indicou:</b>{" "}
                  {selectedChildren.length
                    ? selectedChildren.map((c) => c.nomeCompleto).join(", ")
                    : "ninguém ainda"}
                </div>
              </div>
            </div>
          ) : (
            <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-slate-500">
              Arraste o fundo para mover · scroll para zoom
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
