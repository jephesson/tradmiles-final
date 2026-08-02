/** Passageiro extraído de documento (RG / CNH / CIN / CPF / certidão). */
export type ExtractedPassenger = {
  fullName: string;
  birthDateBR: string | null; // DD/MM/YYYY
  cpf: string | null; // só dígitos ou formatado
  gender: "M" | "F" | null;
  /** RG / registro quando CPF ausente */
  documentNumber: string | null;
  sourceDocs: string[]; // ex.: ["RG_verso", "CNH"]
  confidence: "high" | "medium" | "low";
  notes?: string | null;
};

export type DocumentExtractResult = {
  passengers: ExtractedPassenger[];
  warnings: string[];
  rawModelText?: string;
};
