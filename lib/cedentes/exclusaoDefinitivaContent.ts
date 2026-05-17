export type Program = "LATAM" | "SMILES" | "LIVELO" | "ESFERA";
export type ScopeMode = "ACCOUNT" | "PROGRAM";

export type CedenteCredentialPreview = {
  nomeCompleto: string;
  identificador: string;
  cpf: string;
  emailCriado: string | null;
  senhaEmail: string | null;
  senhaSmiles: string | null;
  senhaLatamPass: string | null;
  senhaLivelo: string | null;
  senhaEsfera: string | null;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
};

function fmtPoints(v?: number | null) {
  return new Intl.NumberFormat("pt-BR").format(Number(v || 0));
}

export function normalizeCpfPdfPassword(cpf?: string | null): string | null {
  const digits = String(cpf || "").replace(/\D+/g, "").slice(0, 11);
  return digits.length === 11 ? digits : null;
}

function programRows(
  preview: CedenteCredentialPreview,
  mode: ScopeMode,
  program: Program
) {
  if (mode === "ACCOUNT") {
    return [
      {
        title: "LATAM Pass",
        login: preview.cpf || "Não informado",
        password: preview.senhaLatamPass || "Não cadastrada",
        points: preview.pontosLatam,
      },
      {
        title: "Smiles",
        login: preview.cpf || "Não informado",
        password: preview.senhaSmiles || "Não cadastrada",
        points: preview.pontosSmiles,
      },
      {
        title: "Livelo",
        login: preview.cpf || "Não informado",
        password: preview.senhaLivelo || "Não cadastrada",
        points: preview.pontosLivelo,
      },
      {
        title: "Esfera",
        login: preview.cpf || "Não informado",
        password: preview.senhaEsfera || "Não cadastrada",
        points: preview.pontosEsfera,
      },
    ];
  }

  const title =
    program === "LATAM"
      ? "LATAM Pass"
      : program === "SMILES"
        ? "Smiles"
        : program === "LIVELO"
          ? "Livelo"
          : "Esfera";

  const password =
    program === "LATAM"
      ? preview.senhaLatamPass || "Não cadastrada"
      : program === "SMILES"
        ? preview.senhaSmiles || "Não cadastrada"
        : program === "LIVELO"
          ? preview.senhaLivelo || "Não cadastrada"
          : preview.senhaEsfera || "Não cadastrada";

  const points =
    program === "LATAM"
      ? preview.pontosLatam
      : program === "SMILES"
        ? preview.pontosSmiles
        : program === "LIVELO"
          ? preview.pontosLivelo
          : preview.pontosEsfera;

  return [
    {
      title,
      login: preview.cpf || "Não informado",
      password,
      points,
    },
  ];
}

export function buildExclusaoCredentialLines(
  preview: CedenteCredentialPreview,
  opts: { mode: ScopeMode; program: Program; reasonText: string }
): string[] {
  const rows = programRows(preview, opts.mode, opts.program);

  const lines = [
    "Notificação de Exclusão Definitiva de Conta e Encerramento de Vínculo",
    "",
    `Prezado(a) ${preview.nomeCompleto},`,
    "",
    "Informamos que a Vias Aéreas Viagens e Turismo LTDA, inscrita no CNPJ 63.817.773/0001-85, está procedendo com a exclusão definitiva da conta em nossa plataforma.",
    "",
    "Motivo da exclusão:",
    opts.reasonText,
    "",
    "Dados da conta (acesso e saldo):",
    `Titular: ${preview.nomeCompleto}`,
    `Identificador interno: ${preview.identificador}`,
    `CPF: ${preview.cpf || "Não informado"}`,
    `E-mail/login criado: ${preview.emailCriado || "Não informado"}`,
    `Senha atual do e-mail: ${preview.senhaEmail || "Não cadastrada"}`,
  ];

  for (const row of rows) {
    lines.push("");
    lines.push(`${row.title}:`);
    lines.push(`Login: ${row.login}`);
    lines.push(`Senha atual: ${row.password}`);
    lines.push(`Saldo de pontos/milhas: ${fmtPoints(row.points)}`);
  }

  lines.push("");
  lines.push(
    "Recomendação de segurança: solicitamos a troca imediata de todas as senhas e dados de recuperação vinculados ao e-mail e aos portais relacionados, para garantir a integridade dos seus dados após este encerramento."
  );
  lines.push("");
  lines.push(
    "Observação: este documento serve como comprovante de entrega das credenciais e de encerramento de responsabilidade da Vias Aéreas sobre a conta mencionada."
  );
  lines.push("");
  lines.push("Atenciosamente,");
  lines.push("Vias Aéreas Viagens e Turismo LTDA");
  lines.push("CNPJ: 63.817.773/0001-85");

  return lines;
}

export function buildExclusaoWhatsappShortMessage(
  preview: Pick<CedenteCredentialPreview, "nomeCompleto">,
  reasonText: string
): string {
  return [
    "Assunto: Notificação de Exclusão Definitiva de Conta e Encerramento de Vínculo",
    "",
    `Prezado(a) ${preview.nomeCompleto},`,
    "",
    "Informamos que a Vias Aéreas Viagens e Turismo LTDA, inscrita no CNPJ 63.817.773/0001-85, está procedendo com a exclusão definitiva da conta em nossa plataforma.",
    "",
    "Motivo da exclusão:",
    reasonText,
    "",
    "Em anexo segue um PDF com os dados de acesso e saldos da conta.",
    "Para abrir o arquivo, use como senha o seu CPF com 11 dígitos (somente números, sem pontos ou traço).",
    "",
    "Recomendação de segurança: solicitamos a troca imediata de todas as senhas e dados de recuperação vinculados ao e-mail e aos portais relacionados.",
    "",
    "Observação: esta mensagem serve como comprovante de entrega do encerramento; os dados sensíveis estão apenas no PDF protegido.",
    "",
    "Atenciosamente,",
    "Vias Aéreas Viagens e Turismo LTDA",
    "CNPJ: 63.817.773/0001-85",
  ].join("\n");
}
