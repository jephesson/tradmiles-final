import { cn } from "@/lib/cn";

/** Layout da página (alinhado a Vendas / Nova venda) */
export const VP_PAGE_SHELL = "mx-auto max-w-[1800px] space-y-5 p-4 pb-10 sm:p-6";

export const VP_FIELD_LABEL =
  "text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export const VP_CONTROL_INPUT =
  "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

export const VP_CONTROL_INPUT_MONO = cn(VP_CONTROL_INPUT, "font-mono tabular-nums");

export const VP_CONTROL_SELECT =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10";

export const VP_FILTER_CARD =
  "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/40 sm:p-5";

export const VP_BTN_SECONDARY =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50";

export const VP_TABLE_WRAP =
  "overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/35";

export const VP_TABLE_HEAD =
  "border-b border-slate-200/80 bg-slate-50/95 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export const VP_TABLE_HEAD_CELL = "px-4 py-3";

export const VP_TABLE_ROW =
  "border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50/90";

export const VP_MODAL_BACKDROP =
  "absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]";

export const VP_MODAL_PANEL =
  "absolute left-1/2 top-1/2 w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xl shadow-slate-900/20 sm:p-6";
