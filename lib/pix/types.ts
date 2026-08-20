export type ParsedPixEmail = {
  bank: "INTER" | "NUBANK" | "OTHER";
  direction: "IN" | "OUT";
  amountCents: number;
  payerName: string | null;
  payeeAccount: string | null;
  confidence: "high" | "medium" | "low";
  source: "regex" | "openai";
};

export type PixClassification =
  | "CLIENT_PAYMENT"
  | "EMPLOYEE"
  | "COMPANY_INTERNAL"
  | "UNKNOWN";

export type PixMatchSale = {
  saleId: string;
  numero: string;
  locator: string | null;
  totalCents: number;
  clienteNome: string;
  date: string;
  program: string;
};

export type PixMatchResult = {
  classification: PixClassification;
  classificationLabel: string;
  suggestedSales: PixMatchSale[];
  matchKind: "exact" | "grouped" | "name_only" | "amount_only" | "none";
  matchedTotalCents: number;
  amountDiffCents: number;
  employeeName: string | null;
};

export type PixAlertRow = {
  id: string;
  subject: string;
  snippet: string;
  date: string | null;
  parsed: ParsedPixEmail | null;
  match: PixMatchResult;
};
