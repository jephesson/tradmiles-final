/** Só dígitos. */
export function onlyDigits(s: string) {
  return String(s || "").replace(/\D+/g, "");
}

/** Validação de dígitos verificadores do CPF. */
export function isValidCpf(raw: string | null | undefined): boolean {
  const cpf = onlyDigits(String(raw || ""));
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

export function cpfHint(raw: string | null | undefined): string | null {
  const cpf = onlyDigits(String(raw || ""));
  if (!cpf) return "Informe os 11 dígitos do CPF.";
  if (cpf.length < 11) return `CPF incompleto (${cpf.length} de 11 dígitos).`;
  if (cpf.length > 11) return "CPF deve ter 11 dígitos.";
  if (!isValidCpf(cpf)) return "CPF inválido — confira os dígitos.";
  return null;
}
