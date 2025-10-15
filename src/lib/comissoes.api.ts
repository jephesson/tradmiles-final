// src/lib/comissoes.api.ts
import type { ComissaoCedente, IComissoesRepo, StatusComissao } from "./comissoes.repo";

const JSON = (r: Response) => r.json().catch(() => ({}));

export class ApiComissoesRepo implements IComissoesRepo {
  base = "/api/comissoes";

  async list(params?: { q?: string; status?: StatusComissao | "" }): Promise<ComissaoCedente[]> {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.status) qs.set("status", params.status);
    const res = await fetch(`${this.base}?${qs.toString()}`, { cache: "no-store" });
    const json = await JSON(res);
    return Array.isArray(json?.data) ? (json.data as ComissaoCedente[]) : [];
  }

  async upsert(
    payload: Omit<ComissaoCedente, "id" | "criadoEm" | "atualizadoEm"> & { id?: string }
  ): Promise<ComissaoCedente> {
    const res = await fetch(this.base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await JSON(res);
    if (!res.ok) throw new Error(json?.error || "Falha ao salvar comissão");
    return json?.data as ComissaoCedente;
  }

  async setStatus(id: string, status: StatusComissao): Promise<void> {
    const res = await fetch(`${this.base}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error("Falha ao atualizar status");
  }

  async remove(id: string): Promise<void> {
    const res = await fetch(`${this.base}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Falha ao remover");
  }
}
