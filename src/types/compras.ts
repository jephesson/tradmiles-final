// Tipos reutilizáveis para Compras/Transferências/Clube

export type CIA = "latam" | "smiles";
export type Origem = "livelo" | "esfera";
export type Programa = "latam" | "smiles" | "livelo" | "esfera";
export type StatusPontos = "aguardando" | "liberados";

export type Modo = "compra" | "transferencia";

export interface ItemResumo {
  /** Pontos totais que este item adiciona (quando calculado no frontend ou salvo no backend) */
  totalPts?: number;
  /** Lucro total deste item, se já calculado e salvo */
  lucroTotal?: number;
}

export interface ItemClube {
  kind: "clube";
  data: {
    programa: Programa;
    pontos: number;
    valor: number;
  };
  /** Alguns modelos antigos colocam um "resumo" com totais por item */
  resumo?: ItemResumo;
}

export interface ItemCompra {
  kind: "compra";
  data: {
    programa: Programa;      // onde os pontos foram comprados
    pontos: number;
    valor: number;           // R$
    bonusPct: number;        // ex.: 80, 100...
  };
  resumo?: ItemResumo;
}

export interface ItemTransferencia {
  kind: "transferencia";
  data: {
    origem: Origem;          // esfera | livelo
    destino: CIA;            // latam | smiles
    modo: "pontos" | "pontos+dinheiro";
    pontosUsados: number;    // pontos debitados da origem
    pontosTotais: number;    // pontos creditados no destino
    valorPago: number;       // eventual dinheiro pago
    bonusPct: number;
  };
  resumo?: ItemResumo;
}

export type CompraItem = ItemClube | ItemCompra | ItemTransferencia;

export type CompraRow = {
  id: string;
  dataCompra: string;
  statusPontos?: StatusPontos;

  // ===== Modelo antigo (um único item agregado) =====
  modo?: Modo;
  ciaCompra?: CIA;
  destCia?: CIA;
  origem?: Origem;
  calculos?: { totalPts: number; custoMilheiro: number; custoTotal: number; lucroTotal: number };

  // ===== Modelo novo (vários itens) =====
  itens?: CompraItem[];
  totais?: {
    totalCIA?: number;             // pontos
    custoMilheiroTotal?: number;   // R$/milheiro (total)
    lucroTotal?: number;           // R$
    metaMilheiro?: number;
  };

  // ===== Variações antigas =====
  totaisId?: { totalPts: number; custoMilheiro: number; custoTotal: number; lucroTotal: number };
  metaMilheiro?: number; // algumas versões guardam na raiz
};

// ---------- Type guards úteis ----------
export function isItemCompra(i: CompraItem): i is ItemCompra {
  return i.kind === "compra";
}
export function isItemTransf(i: CompraItem): i is ItemTransferencia {
  return i.kind === "transferencia";
}
export function isItemClube(i: CompraItem): i is ItemClube {
  return i.kind === "clube";
}
