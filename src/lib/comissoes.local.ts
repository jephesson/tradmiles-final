// src/lib/comissoes.local.ts
import type { ComissaoCedente, IComissoesRepo, StatusComissao } from "./comissoes.repo";

const KEY = "tm_comissoes_v1";
const isBrowser = () => typeof window !== "undefined";

function loadAll(): ComissaoCedente[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as ComissaoCedente[];
  } catch {
    return [];
  }
}
function saveAll(list: ComissaoCedente[]) {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

export class LocalComissoesRepo implements IComissoesRepo {
  async list(params?: { q?: string; status?: StatusComissao | "" }): Promise<ComissaoCedente[]> {
    const all = loadAll();
    const q = (params?.q || "").toLowerCase();
    const st = params?.status || "";
    const fil = all.filter((c) => {
      const byQ =
        !q ||
        c.cedenteNome.toLowerCase().includes(q) ||
        c.compraId.toLowerCase().includes(q);
      const byS = !st || c.status === st;
      return byQ && byS;
    });
    return fil.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
  }

  async upsert(
    payload: Omit<ComissaoCedente, "id" | "criadoEm" | "atualizadoEm"> & { id?: string }
  ): Promise<ComissaoCedente> {
    const all = loadAll();
    const now = new Date().toISOString();

    // evita duplicar por compraId + cedenteId
    const idx = all.findIndex(
      (c) => c.compraId === payload.compraId && c.cedenteId === payload.cedenteId
    );
    if (idx >= 0) {
      const updated: ComissaoCedente = { ...all[idx], ...payload, atualizadoEm: now };
      all[idx] = updated;
      saveAll(all);
      return updated;
    }

    const novo: ComissaoCedente = {
      id: crypto.randomUUID(),
      criadoEm: now,
      atualizadoEm: now,
      ...payload,
    };
    all.unshift(novo);
    saveAll(all);
    return novo;
  }

  async setStatus(id: string, status: StatusComissao): Promise<void> {
    const all = loadAll();
    const idx = all.findIndex((c) => c.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], status, atualizadoEm: new Date().toISOString() };
      saveAll(all);
    }
  }

  async remove(id: string): Promise<void> {
    const all = loadAll().filter((c) => c.id !== id);
    saveAll(all);
  }
}
