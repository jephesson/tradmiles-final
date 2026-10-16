export type CedentesCount = {
  cedentes?: number;
  ativos?: number;
  pendentes?: number;
  recusados?: number;
  excluidos?: number;
};

export function CedentesBreakdown({ counts }: { counts?: CedentesCount | null }) {
  const ativos = counts?.ativos ?? 0;
  const pendentes = counts?.pendentes ?? 0;
  const recusados = counts?.recusados ?? 0;
  const excluidos = counts?.excluidos ?? 0;
  const total = counts?.cedentes ?? ativos + pendentes + recusados + excluidos;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
      <span>
        Cedentes: <span className="font-semibold text-slate-700">{total}</span>
      </span>
      <span className="text-slate-300">·</span>
      <span>
        <span className="font-semibold text-emerald-700">{ativos}</span> ativos
      </span>
      <span>
        <span className="font-semibold text-amber-700">{pendentes}</span> pendentes
      </span>
      <span>
        <span className="font-semibold text-slate-700">{recusados}</span> recusados
      </span>
      <span>
        <span className="font-semibold text-rose-700">{excluidos}</span> excluídos
      </span>
    </div>
  );
}
