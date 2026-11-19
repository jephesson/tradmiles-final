"use client";

import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth";
import { readViewAsEmissorClient, type ViewAsEmissor } from "@/lib/viewAsEmissor";

/**
 * A interface deve se comportar como emissor?
 * - emissor logado, ou
 * - admin em "Ver como emissor" (preview = qual emissor).
 * Lido depois de montar (evita diferença entre servidor e navegador).
 */
export function useEmissorView() {
  const [state, setState] = useState<{ asEmissor: boolean; preview: ViewAsEmissor | null }>({
    asEmissor: false,
    preview: null,
  });
  useEffect(() => {
    const t = window.setTimeout(() => {
      const s = getSession();
      const preview = s?.role === "admin" ? readViewAsEmissorClient() : null;
      setState({ asEmissor: s?.role === "emissor" || Boolean(preview), preview });
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  return state;
}

/** Versão síncrona para componentes que só montam no navegador (modais). */
export function emissorViewNow() {
  const s = getSession();
  const preview = s?.role === "admin" ? readViewAsEmissorClient() : null;
  return { asEmissor: s?.role === "emissor" || Boolean(preview), preview };
}
