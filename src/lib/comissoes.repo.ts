// src/lib/comissoes.repo.ts
// 👉 Este arquivo expõe SOMENTE tipos e a interface do repositório.
//    Não coloque implementação aqui.

export type StatusComissao = string; // mantenho aberto para compatibilidade

export type ComissaoCedente = {
  id: string;
  compraId: string;
  cedenteId: string;
  cedenteNome: string;

  // Campos comuns/úteis (opcionais para não travar o build se faltar em algum lugar)
  valor?: number;
  status: StatusComissao;

  criadoEm?: string;     // ISO
  atualizadoEm?: string; // ISO
};

// Repositório (contrato) que as implementações devem seguir
export interface IComissoesRepo {
  list(params?: { q?: string; status?: StatusComissao | "" }): Promise<ComissaoCedente[]>;
  upsert(
    payload: Omit<ComissaoCedente, "id" | "criadoEm" | "atualizadoEm"> & { id?: string }
  ): Promise<ComissaoCedente>;
  setStatus(id: string, status: StatusComissao): Promise<void>;
  remove(id: string): Promise<void>;
}
