import { cn } from "@/lib/cn";

/** Layout da página (alinhado a Vendas / Nova venda) */
export const VP_PAGE_SHELL = "mx-auto max-w-[1800px] space-y-6 p-5 pb-12 sm:p-8";

export const VP_FIELD_LABEL =
  "text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500";

export const VP_CONTROL_INPUT =
  "w-full min-w-0 rounded-xl border-0 bg-slate-50/90 px-3.5 py-2.5 text-sm text-slate-900 shadow-inner shadow-slate-900/[0.03] outline-none ring-1 ring-slate-200/75 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-sky-500/25";

export const VP_CONTROL_INPUT_MONO = cn(VP_CONTROL_INPUT, "font-mono tabular-nums");

export const VP_CONTROL_SELECT =
  "rounded-xl border-0 bg-slate-50/90 px-3.5 py-2.5 text-sm font-semibold text-slate-900 shadow-inner shadow-slate-900/[0.03] outline-none ring-1 ring-slate-200/75 transition focus:bg-white focus:ring-2 focus:ring-sky-500/25";

export const VP_FILTER_CARD =
  "rounded-2xl border-0 bg-white/95 p-5 shadow-lg shadow-slate-900/[0.055] ring-1 ring-slate-200/65 backdrop-blur-sm sm:p-6";

export const VP_BTN_SECONDARY =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border-0 bg-white px-4 text-sm font-semibold text-slate-800 shadow-md shadow-slate-900/[0.06] outline-none ring-1 ring-slate-200/70 transition hover:bg-slate-50/95 hover:shadow-lg hover:ring-slate-300/70 disabled:pointer-events-none disabled:opacity-50";

export const VP_TABLE_WRAP =
  "overflow-hidden rounded-2xl border-0 bg-white/95 shadow-lg shadow-slate-900/[0.055] ring-1 ring-slate-200/65";

export const VP_TABLE_HEAD =
  "border-b border-slate-200/65 bg-slate-50/92 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500 backdrop-blur-sm";

export const VP_TABLE_HEAD_CELL = "px-4 py-3.5";

export const VP_TABLE_ROW =
  "border-b border-slate-100/90 transition-colors duration-150 last:border-b-0 hover:bg-sky-50/35";

export const VP_MODAL_BACKDROP =
  "absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]";

export const VP_MODAL_PANEL =
  "absolute left-1/2 top-1/2 w-[min(94vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xl shadow-slate-900/20 sm:p-6";
