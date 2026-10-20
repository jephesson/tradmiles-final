"use client";

import { useRef, useState } from "react";

type Rect = { x: number; y: number; w: number; h: number };

function normRect(x0: number, y0: number, x1: number, y1: number): Rect {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

function pointOnImage(e: React.MouseEvent<HTMLDivElement>, img: HTMLImageElement) {
  const box = img.getBoundingClientRect();
  const x = Math.max(0, Math.min(box.width, e.clientX - box.left));
  const y = Math.max(0, Math.min(box.height, e.clientY - box.top));
  return { x, y };
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.86) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Falha ao gerar a imagem."));
        else resolve(blob);
      },
      type,
      quality
    );
  });
}

export default function ScreenRegionPicker(props: {
  dataUrl: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [sel, setSel] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);

  function blobToFile(blob: Blob, name: string) {
    return new File([blob], name, { type: blob.type || "image/jpeg" });
  }

  async function exportRect(rect: Rect | null) {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) throw new Error("Imagem ainda não carregou.");
    const displayW = img.clientWidth || img.naturalWidth;
    const displayH = img.clientHeight || img.naturalHeight;
    const scaleX = img.naturalWidth / displayW;
    const scaleY = img.naturalHeight / displayH;
    const use = rect && rect.w >= 8 && rect.h >= 8 ? rect : { x: 0, y: 0, w: displayW, h: displayH };
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(use.w * scaleX));
    canvas.height = Math.max(1, Math.round(use.h * scaleY));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível.");
    ctx.drawImage(
      img,
      Math.round(use.x * scaleX),
      Math.round(use.y * scaleY),
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
    const blob = await canvasToBlob(canvas);
    return blobToFile(blob, "telegram-tela.jpg");
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/55 p-3 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">Marcar dados do Telegram</div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Arraste em cima da tabela de passageiro (nome, CPF, nascimento). Se não marcar nada, lê a
            tela inteira.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3">
          <div
            className="relative mx-auto w-fit cursor-crosshair select-none"
            onMouseDown={(e) => {
              const img = imgRef.current;
              if (!img) return;
              const p = pointOnImage(e, img);
              dragStart.current = p;
              setDragging(true);
              setSel({ x: p.x, y: p.y, w: 0, h: 0 });
            }}
            onMouseMove={(e) => {
              if (!dragging || !dragStart.current || !imgRef.current) return;
              const p = pointOnImage(e, imgRef.current);
              setSel(normRect(dragStart.current.x, dragStart.current.y, p.x, p.y));
            }}
            onMouseUp={() => {
              setDragging(false);
              dragStart.current = null;
            }}
            onMouseLeave={() => {
              setDragging(false);
              dragStart.current = null;
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={props.dataUrl}
              alt="Tela capturada"
              className="max-h-[62vh] max-w-full rounded-lg border border-slate-200 bg-white"
              draggable={false}
            />
            {sel && sel.w > 2 && sel.h > 2 ? (
              <div
                className="pointer-events-none absolute border-2 border-emerald-400 bg-emerald-400/15"
                style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            disabled={props.busy}
            onClick={props.onCancel}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => void exportRect(null).then(props.onConfirm)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Tela inteira
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => void exportRect(sel).then(props.onConfirm)}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {props.busy ? "Lendo…" : sel && sel.w >= 8 ? "Usar recorte" : "Ler tela"}
          </button>
        </div>
      </div>
    </div>
  );
}
