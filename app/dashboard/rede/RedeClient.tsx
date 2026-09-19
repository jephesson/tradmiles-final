"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  ArrowUp,
  GitBranch,
  Loader2,
  LocateFixed,
  Minus,
  Network,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  childrenMap,
  descendantsOf,
  layoutForest,
  NODE_H,
  NODE_W,
  pathToRoot,
  rootOf,
  treeNodes,
  type LaidOutNode,
  type RedeNode,
} from "@/lib/rede/layout";

type Graph = {
  nodes: RedeNode[];
  edges: Array<{ from: string; to: string }>;
  stats: { people: number; links: number; roots: number; maxDirect: number };
};

type ViewMode = "navegar" | "arvore";

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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarTone(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) % 360;
  return {
    background: `hsl(${h} 72% 93%)`,
    color: `hsl(${h} 42% 32%)`,
    ring: `hsl(${h} 55% 78%)`,
  };
}

function connectorPath(from: LaidOutNode, to: LaidOutNode) {
  const x1 = from.x + NODE_W / 2;
  const y1 = from.y + NODE_H;
  const x2 = to.x + NODE_W / 2;
  const y2 = to.y;
  const mid = y1 + (y2 - y1) / 2;
  return `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
}

function Avatar({
  id,
  name,
  size = "md",
}: {
  id: string;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const tone = avatarTone(id);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight ring-1",
        size === "sm" && "h-8 w-8 text-[11px]",
        size === "md" && "h-10 w-10 text-sm",
        size === "lg" && "h-14 w-14 text-lg"
      )}
      style={{ background: tone.background, color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
    >
      {initials(name)}
    </div>
  );
}

export default function RedeClient() {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("navegar");
  const [scale, setScale] = useState(0.9);
  const [pan, setPan] = useState({ x: 64, y: 48 });
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const surface = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);
  scaleRef.current = scale;
  panRef.current = pan;

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

  const downCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of graph?.nodes || []) {
      map.set(n.id, Math.max(0, descendantsOf(n.id, kids).size - 1));
    }
    return map;
  }, [graph, kids]);

  const roots = useMemo(() => {
    return (graph?.nodes || [])
      .filter((n) => !n.parentId)
      .sort((a, b) => (downCount.get(b.id) || 0) - (downCount.get(a.id) || 0));
  }, [graph, downCount]);

  const selected = selectedId ? byId.get(selectedId) || null : null;
  const selectedChildren = selectedId ? kids.get(selectedId) || [] : [];
  const selectedParent = selected?.parentId ? byId.get(selected.parentId) || null : null;
  const lineage = selectedId ? pathToRoot(selectedId, byId) : [];
  const selectedRoot = selectedId ? rootOf(selectedId, byId) : null;

  const focusedTreeNodes = useMemo(() => {
    if (!selectedRoot) return [];
    return treeNodes(selectedRoot.id, byId, kids);
  }, [selectedRoot, byId, kids]);

  const layout = useMemo(() => layoutForest(focusedTreeNodes), [focusedTreeNodes]);
  const placedById = useMemo(() => new Map(layout.placed.map((n) => [n.id, n])), [layout]);

  const matchList = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const source = graph?.nodes || [];
    if (!needle) {
      return [...source].sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
    }
    return source
      .filter((n) => {
        const blob = `${n.nomeCompleto} ${n.identificador} ${n.ownerName}`.toLowerCase();
        return blob.includes(needle);
      })
      .sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, "pt-BR"));
  }, [graph, q]);

  const highlight = useMemo(() => {
    if (!selectedId) return null;
    return new Set([...descendantsOf(selectedId, kids), ...pathToRoot(selectedId, byId).map((n) => n.id)]);
  }, [selectedId, kids, byId]);

  const fitTree = useCallback(() => {
    const box = surface.current?.getBoundingClientRect();
    if (!box || !layout.width || !layout.height) return;
    const pad = 56;
    const next = Math.min(1.25, Math.max(0.22, Math.min((box.width - pad * 2) / layout.width, (box.height - pad * 2) / layout.height)));
    setScale(next);
    setPan({
      x: Math.max(24, (box.width - layout.width * next) / 2),
      y: Math.max(24, Math.min(72, (box.height - layout.height * next) / 4)),
    });
  }, [layout.width, layout.height]);

  useEffect(() => {
    if (viewMode !== "arvore" || !selectedRoot) return;
    const t = window.setTimeout(fitTree, 40);
    return () => window.clearTimeout(t);
  }, [viewMode, selectedRoot?.id, layout.width, layout.height, fitTree]);

  useEffect(() => {
    const el = surface.current;
    if (!el || viewMode !== "arvore") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const prev = scaleRef.current;
      const factor = e.deltaY > 0 ? 0.92 : 1.09;
      const next = Math.min(2, Math.max(0.18, prev * factor));
      const wx = (mx - panRef.current.x) / prev;
      const wy = (my - panRef.current.y) / prev;
      setScale(next);
      setPan({ x: mx - wx * next, y: my - wy * next });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [viewMode, loading]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-node]")) return;
    drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    setPanning(true);
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
    setPanning(false);
  }

  function focusPerson(id: string, mode?: ViewMode) {
    setSelectedId(id);
    if (mode) setViewMode(mode);
  }

  function centerOnNode(id: string) {
    const node = placedById.get(id);
    const box = surface.current?.getBoundingClientRect();
    if (!node || !box) return;
    setPan({
      x: box.width / 2 - (node.x + NODE_W / 2) * scale,
      y: box.height / 3 - node.y * scale,
    });
  }

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-56px)] min-h-0 flex-col overflow-hidden bg-[#f6f3ff] sm:-mx-6 lg:-mx-8">
      <style>{`
        @keyframes rede-in {
          from { opacity: 0; transform: translateY(10px) scale(.98); }
          to { opacity: 1; transform: none; }
        }
        @keyframes rede-dash { to { stroke-dashoffset: -240; } }
        @keyframes rede-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, .28); }
          50% { box-shadow: 0 0 0 10px rgba(124, 58, 237, 0); }
        }
        .rede-in { animation: rede-in .42s cubic-bezier(.2,.8,.2,1) both; }
        .rede-pulse { animation: rede-pulse 2.2s ease-out infinite; }
      `}</style>

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-violet-100/80 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
            <Network className="h-3.5 w-3.5" strokeWidth={2.2} />
            Rede viva
          </div>
          <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Fluxograma de indicações
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {graph ? (
            <>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-700">
                {graph.stats.people} na rede
              </span>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-[12px] font-medium text-violet-800">
                {graph.stats.links} indicações
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-700">
                {graph.stats.roots} raízes
              </span>
            </>
          ) : null}
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 text-[12px] font-semibold">
            <button
              type="button"
              className={cn(
                "rounded-lg px-3 py-1.5 transition",
                viewMode === "navegar" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              )}
              onClick={() => setViewMode("navegar")}
            >
              Navegar
            </button>
            <button
              type="button"
              className={cn(
                "rounded-lg px-3 py-1.5 transition",
                viewMode === "arvore" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              )}
              onClick={() => setViewMode("arvore")}
              disabled={!selected}
            >
              Árvore
            </button>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-violet-100/90 bg-white">
          <div className="border-b border-slate-100 p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-900/10"
                placeholder="Buscar qualquer cedente"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <div className="mt-2 text-[11px] text-slate-500">
              {q.trim()
                ? `${matchList.length} resultado${matchList.length === 1 ? "" : "s"}`
                : `${matchList.length} pessoas · clique para entrar na ramificação`}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {matchList.map((n) => {
              const down = downCount.get(n.id) || 0;
              const direct = kids.get(n.id)?.length || 0;
              const active = selectedId === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => focusPerson(n.id)}
                  className={cn(
                    "mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition",
                    active ? "bg-violet-50 ring-1 ring-violet-200" : "hover:bg-slate-50"
                  )}
                >
                  <Avatar id={n.id} name={n.nomeCompleto} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-slate-800">{n.nomeCompleto}</div>
                    <div className="truncate text-[11px] text-slate-500">
                      {n.identificador}
                      {direct ? ` · ${direct} direto${direct === 1 ? "" : "s"}` : ""}
                      {down ? ` · ${down} na ramificação` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
            {!matchList.length && !loading ? (
              <div className="px-3 py-10 text-center text-sm text-slate-500">
                {q.trim() ? "Ninguém encontrado nessa busca." : "Ainda não há indicações ligando cedentes."}
              </div>
            ) : null}
          </div>
        </aside>

        <section className="relative min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Montando a rede…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-rose-700">{error}</div>
          ) : viewMode === "navegar" && !selected ? (
            <div className="h-full overflow-y-auto p-4 sm:p-6">
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
                <Sparkles className="h-4 w-4 text-violet-600" />
                Escolha uma raiz para entrar na ramificação — ou busque alguém na lista.
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {roots.map((root, i) => {
                  const down = downCount.get(root.id) || 0;
                  const direct = kids.get(root.id)?.length || 0;
                  return (
                    <button
                      key={root.id}
                      type="button"
                      onClick={() => focusPerson(root.id, "navegar")}
                      className="rede-in rounded-2xl border border-white/80 bg-white p-4 text-left shadow-sm shadow-violet-900/5 ring-1 ring-violet-100 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-violet-200"
                      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar id={root.id} name={root.nomeCompleto} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-slate-900">{root.nomeCompleto}</div>
                          <div className="text-[12px] text-slate-500">{root.identificador}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1", statusClass(root.status))}>
                              {statusLabel(root.status)}
                            </span>
                            <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
                              {direct} direto{direct === 1 ? "" : "s"}
                            </span>
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                              {down} na ramificação
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : viewMode === "navegar" && selected ? (
            <div className="flex h-full flex-col overflow-y-auto">
              <div className="flex flex-wrap items-center gap-2 border-b border-violet-100/80 bg-white/60 px-4 py-2.5 sm:px-6">
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-white hover:text-slate-800"
                  onClick={() => setSelectedId(null)}
                >
                  Raízes
                </button>
                {lineage.map((n) => (
                  <span key={n.id} className="flex items-center gap-2">
                    <span className="text-slate-300">/</span>
                    <button
                      type="button"
                      onClick={() => focusPerson(n.id)}
                      className={cn(
                        "max-w-[180px] truncate rounded-lg px-2 py-1 text-[12px] font-medium",
                        n.id === selected.id
                          ? "bg-violet-100 text-violet-900"
                          : "text-slate-600 hover:bg-white hover:text-slate-900"
                      )}
                    >
                      {n.nomeCompleto}
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-violet-800 hover:bg-violet-50"
                  onClick={() => setViewMode("arvore")}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Ver árvore deste ramo
                </button>
              </div>

              <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-0 px-4 py-8 sm:px-8">
                {selectedParent ? (
                  <>
                    <button
                      type="button"
                      onClick={() => focusPerson(selectedParent.id)}
                      className="rede-in group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
                    >
                      <Avatar id={selectedParent.id} name={selectedParent.nomeCompleto} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          <ArrowUp className="h-3 w-3" /> Indicado por
                        </div>
                        <div className="truncate text-sm font-semibold text-slate-800 group-hover:text-violet-800">
                          {selectedParent.nomeCompleto}
                        </div>
                      </div>
                    </button>
                    <div className="h-8 w-px bg-gradient-to-b from-violet-300 to-violet-500" />
                  </>
                ) : (
                  <div className="mb-3 rounded-full bg-violet-100 px-3 py-1 text-[11px] font-semibold text-violet-800">
                    Raiz da ramificação
                  </div>
                )}

                <div
                  key={selected.id}
                  className="rede-in rede-pulse w-full max-w-lg rounded-3xl border border-violet-200 bg-white p-5 shadow-xl shadow-violet-900/10"
                >
                  <div className="flex items-start gap-4">
                    <Avatar id={selected.id} name={selected.nomeCompleto} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-bold tracking-tight text-slate-900">{selected.nomeCompleto}</div>
                      <div className="text-sm text-slate-500">{selected.identificador}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", statusClass(selected.status))}>
                          {statusLabel(selected.status)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          Gestor: {selected.ownerName}
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/cedentes/${selected.id}`}
                      className="shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-[12px] font-semibold text-white hover:bg-slate-800"
                    >
                      Abrir ficha
                    </Link>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl bg-violet-50 px-2 py-3">
                      <div className="text-lg font-bold text-violet-900">{selectedChildren.length}</div>
                      <div className="text-[11px] text-violet-700">diretos</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-2 py-3">
                      <div className="text-lg font-bold text-slate-900">{downCount.get(selected.id) || 0}</div>
                      <div className="text-[11px] text-slate-500">na ramificação</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-2 py-3">
                      <div className="text-lg font-bold text-slate-900">{Math.max(0, lineage.length - 1)}</div>
                      <div className="text-[11px] text-slate-500">níveis acima</div>
                    </div>
                  </div>
                </div>

                {selectedChildren.length ? (
                  <>
                    <div className="h-8 w-px bg-gradient-to-b from-violet-500 to-violet-200" />
                    <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                      <Users className="h-3.5 w-3.5" />
                      Indicou {selectedChildren.length}
                    </div>
                    <div className="grid w-full gap-3 sm:grid-cols-2">
                      {selectedChildren.map((child, i) => {
                        const down = downCount.get(child.id) || 0;
                        const direct = kids.get(child.id)?.length || 0;
                        return (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => focusPerson(child.id)}
                            className="rede-in group rounded-2xl border border-white bg-white/90 p-4 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:ring-violet-300 hover:shadow-md"
                            style={{ animationDelay: `${i * 45}ms` }}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar id={child.id} name={child.nomeCompleto} />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-semibold text-slate-900 group-hover:text-violet-800">
                                  {child.nomeCompleto}
                                </div>
                                <div className="truncate text-[12px] text-slate-500">{child.identificador}</div>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1", statusClass(child.status))}>
                                {statusLabel(child.status)}
                              </span>
                              {direct ? (
                                <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">
                                  {direct} direto{direct === 1 ? "" : "s"}
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                                  sem indicados
                                </span>
                              )}
                              {down ? (
                                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  {down} abaixo
                                </span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-8 text-center text-sm text-slate-500">
                    Esta pessoa ainda não indicou ninguém. Suba pelo indicador ou busque outro cedente.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, rgba(124,58,237,.16) 1px, transparent 0)",
                  backgroundSize: "22px 22px",
                }}
              />
              <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
                <button type="button" className="rounded-lg p-1.5 hover:bg-slate-100" onClick={() => setScale((s) => Math.max(0.18, s / 1.12))} aria-label="Diminuir zoom">
                  <Minus className="h-4 w-4" />
                </button>
                <div className="w-10 text-center text-[11px] font-medium text-slate-600">{Math.round(scale * 100)}%</div>
                <button type="button" className="rounded-lg p-1.5 hover:bg-slate-100" onClick={() => setScale((s) => Math.min(2, s * 1.12))} aria-label="Aumentar zoom">
                  <Plus className="h-4 w-4" />
                </button>
                <button type="button" className="rounded-lg p-1.5 hover:bg-slate-100" onClick={fitTree} aria-label="Enquadrar árvore" title="Enquadrar">
                  <LocateFixed className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-[12px] font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white"
                onClick={() => setViewMode("navegar")}
              >
                <X className="h-3.5 w-3.5" />
                Voltar à navegação
              </button>

              <div
                ref={surface}
                className={cn("relative h-full", panning ? "cursor-grabbing" : "cursor-grab")}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <svg width="100%" height="100%" className="block h-full w-full">
                  <g
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                      transformOrigin: "0 0",
                      transition: panning ? "none" : "transform 280ms cubic-bezier(.2,.8,.2,1)",
                    }}
                  >
                    {(graph?.edges || []).map((e) => {
                      const from = placedById.get(e.from);
                      const to = placedById.get(e.to);
                      if (!from || !to) return null;
                      const onPath = highlight && highlight.has(e.from) && highlight.has(e.to);
                      const dim = highlight && !onPath;
                      return (
                        <path
                          key={`${e.from}-${e.to}`}
                          d={connectorPath(from, to)}
                          fill="none"
                          stroke={onPath ? "#7c3aed" : dim ? "#cbd5e1" : "#a78bfa"}
                          strokeWidth={onPath ? 2.6 : dim ? 1.1 : 1.8}
                          opacity={dim ? 0.28 : 1}
                          strokeDasharray={onPath ? "10 8" : undefined}
                          style={onPath ? { animation: "rede-dash 8s linear infinite" } : undefined}
                        />
                      );
                    })}
                    {layout.placed.map((n) => {
                      const dim = highlight && !highlight.has(n.id);
                      const active = selectedId === n.id;
                      const tone = avatarTone(n.id);
                      return (
                        <g
                          key={n.id}
                          data-node="1"
                          transform={`translate(${n.x} ${n.y})`}
                          className="cursor-pointer"
                          onClick={() => {
                            setSelectedId(n.id);
                            centerOnNode(n.id);
                          }}
                        >
                          <rect
                            width={NODE_W}
                            height={NODE_H}
                            rx={18}
                            fill={active ? "#f5f3ff" : "white"}
                            stroke={active ? "#7c3aed" : "#e9e4f5"}
                            strokeWidth={active ? 2.2 : 1}
                            opacity={dim ? 0.3 : 1}
                            filter="drop-shadow(0 8px 16px rgba(76,29,149,0.08))"
                          />
                          <foreignObject width={NODE_W} height={NODE_H}>
                            <div className="flex h-full items-center gap-2.5 px-3" style={{ opacity: dim ? 0.5 : 1 }}>
                              <div
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                                style={{ background: tone.background, color: tone.color }}
                              >
                                {initials(n.nomeCompleto)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-semibold text-slate-900">{n.nomeCompleto}</div>
                                <div className="truncate text-[11px] text-slate-500">{n.identificador}</div>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1", statusClass(n.status))}>
                                    {statusLabel(n.status)}
                                  </span>
                                  {n.directCount > 0 ? (
                                    <span className="text-[10px] font-medium text-violet-700">
                                      {n.directCount} direto{n.directCount === 1 ? "" : "s"}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </foreignObject>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>

              {selected ? (
                <div className="absolute bottom-3 left-3 right-3 z-10 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-slate-900/10 backdrop-blur sm:left-auto sm:w-[380px]">
                  <div className="flex items-start gap-3">
                    <Avatar id={selected.id} name={selected.nomeCompleto} />
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
                        <button type="button" className="text-violet-700 hover:underline" onClick={() => { focusPerson(selectedParent.id); centerOnNode(selectedParent.id); }}>
                          {selectedParent.nomeCompleto}
                        </button>
                      ) : (
                        "raiz da rede"
                      )}
                    </div>
                    <div>
                      <b>Indicou:</b>{" "}
                      {selectedChildren.length ? (
                        <span className="inline-flex flex-wrap gap-x-1">
                          {selectedChildren.slice(0, 6).map((c, i) => (
                            <button
                              key={c.id}
                              type="button"
                              className="text-violet-700 hover:underline"
                              onClick={() => {
                                focusPerson(c.id);
                                centerOnNode(c.id);
                              }}
                            >
                              {c.nomeCompleto}
                              {i < Math.min(selectedChildren.length, 6) - 1 ? "," : ""}
                            </button>
                          ))}
                          {selectedChildren.length > 6 ? ` +${selectedChildren.length - 6}` : null}
                        </span>
                      ) : (
                        "ninguém ainda"
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-slate-500">
                  Arraste o fundo · scroll no cursor para zoom · um ramo por vez
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
