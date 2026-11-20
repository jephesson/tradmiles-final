/**
 * Contrato de prestação de serviços do emissor (MEI), aceito eletronicamente no link de cadastro.
 * Mudou o texto? Suba a versão: o aceite guarda versão + texto preenchido.
 */
export const EMISSOR_CONTRACT_VERSION = "emissor-v1-2026-11";

/** Indicação de cedente feita por emissor (Cláusula 2.3): R$ 40,00, uma única vez por indicado aprovado. */
export const EMISSOR_REFERRAL_BONUS_CENTS = 4000;

export type ContratoDados = {
  nome: string;
  cpf: string;
  meiCnpj?: string | null;
  email: string;
  telefone: string;
  socioNome: string;
};

export type ContratoSecao = { titulo: string; itens: string[] };

const CONTRATANTE =
  "VIAS AEREAS LTDA (nome fantasia VIAS AÉREAS), sociedade empresária limitada inscrita no CNPJ sob o nº 63.817.773/0001-85, com sede na Avenida T-9, nº 2310, Quadra 523, Lote 10/15, Sala A403, Edifício Inove Place, Jardim América, Goiânia/GO, CEP 74255-220, representada por seu sócio-administrador JEPHESSON ALEX FLORIANO DOS SANTOS, CPF 057.366.524-98, doravante CONTRATANTE.";

const SOCIOS =
  "Sócios da CONTRATANTE: Jephesson Alex Floriano dos Santos (sócio-administrador), Eduarda Vargas Floriano dos Santos, Jocykleber Meireles de Souza, Lucas Henrique Floriano de Araújo e Rian Vitor Floriano do Nascimento Silva.";

function fmtCpf(d: string) {
  const s = String(d || "").replace(/\D/g, "");
  return s.length === 11 ? `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}` : s;
}

function fmtCnpj(d: string) {
  const s = String(d || "").replace(/\D/g, "");
  return s.length === 14
    ? `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`
    : s;
}

export function buildEmissorContrato(d: ContratoDados): ContratoSecao[] {
  const nome = d.nome.trim().toUpperCase() || "[NOME]";
  const mei = d.meiCnpj
    ? `microempreendedor individual inscrito no CNPJ sob o nº ${fmtCnpj(d.meiCnpj)}`
    : "que se compromete a manter inscrição ativa como microempreendedor individual (MEI) e informar o CNPJ à CONTRATANTE";
  const socio = d.socioNome.trim() || "o sócio indicado no cadastro";

  return [
    {
      titulo: "Partes",
      itens: [
        `CONTRATANTE: ${CONTRATANTE}`,
        SOCIOS,
        `CONTRATADO: ${nome}, CPF ${fmtCpf(d.cpf) || "[CPF]"}, ${mei}, e-mail ${d.email || "[e-mail]"}, telefone ${d.telefone || "[telefone]"}, doravante CONTRATADO.`,
        "As partes celebram este Contrato de Prestação de Serviços, regido pelas cláusulas abaixo e pelos artigos 593 a 609 do Código Civil.",
      ],
    },
    {
      titulo: "Cláusula 1 — Objeto e autonomia",
      itens: [
        "1.1. O CONTRATADO presta à CONTRATANTE serviços de emissão de passagens aéreas com milhas e pontos e de atendimento aos clientes, usando o sistema TradeMiles e os canais oficiais indicados pela CONTRATANTE.",
        "1.2. O atendimento a clientes é feito exclusivamente pelo Telegram oficial da CONTRATANTE. O contato com cedentes, para biometria e emissão, é feito somente pelo WhatsApp aberto pelo sistema.",
        "1.3. O CONTRATADO presta os serviços como microempreendedor individual (MEI), com autonomia e sem vínculo empregatício. Escolhe livremente seus dias e horários, sem jornada mínima, controle de ponto ou exclusividade.",
        "1.4. O CONTRATADO usa seus próprios equipamentos (computador, celular e internet) e responde pelos tributos e contribuições do seu MEI.",
        "1.5. A CONTRATANTE fornece o acesso ao sistema, o manual de emissão e as regras operacionais. Seguir esses procedimentos é condição de qualidade e segurança do serviço e não caracteriza subordinação.",
        `1.6. O CONTRATADO responde diretamente aos sócios da CONTRATANTE, em especial a ${socio}, sócio a quem está vinculado. Somente os sócios podem definir regras operacionais, autorizar exceções (isenção de multa, venda abaixo da meta ou do custo, uso de conta com alerta de limite de CPFs), aprovar cancelamentos fora da política e receber as comunicações de incidentes da Cláusula 6.`,
      ],
    },
    {
      titulo: "Cláusula 2 — Remuneração",
      itens: [
        "2.1. Comissão (C1): 1% (um por cento) do valor de cada venda emitida, excluída a taxa de embarque, isto é, sobre o valor dos pontos vendidos ao cliente.",
        "2.2. Bônus acima da meta (C2): cada lote de pontos tem um milheiro-meta (preço por mil pontos, sem taxa) definido pela CONTRATANTE e mostrado no sistema. Vendendo acima da meta, o CONTRATADO recebe 30% (trinta por cento) da diferença: (milheiro da venda − milheiro-meta) × (pontos ÷ 1.000) × 30%. Venda na meta ou abaixo dela não gera bônus.",
        "2.3. Indicação de cedente: R$ 40,00 (quarenta reais), pagos uma única vez, por pessoa indicada pelo CONTRATADO cujo cadastro de cedente seja aprovado pela CONTRATANTE. O cedente indicado fica vinculado aos sócios da CONTRATANTE e não gera outro direito, comissão recorrente ou participação.",
        "2.4. A taxa de embarque nunca entra na base de cálculo da comissão ou do bônus.",
        "2.5. O CONTRATADO não participa do rateio de lucro nem dos bônus mensais da equipe. Suas vendas contam para a meta do sócio a quem está vinculado.",
        "2.6. A CONTRATANTE pode oferecer bonificações extras eventuais (por exemplo, em fins de semana ou feriados), válidas enquanto anunciadas, sem que se incorporem a este contrato.",
        "Exemplo 1: venda de 92.400 pontos a R$ 26,00 o milheiro, com taxa de embarque de R$ 143,00 e meta de R$ 22,00. Valor sem taxa: R$ 2.402,40. C1 = R$ 24,02. C2 = (R$ 26,00 − R$ 22,00) × 92,4 × 30% = R$ 110,88. Total bruto: R$ 134,90.",
        "Exemplo 2: venda de 50.000 pontos a R$ 22,00 (na meta). Valor sem taxa: R$ 1.100,00. C1 = R$ 11,00. C2 = R$ 0,00. Total bruto: R$ 11,00.",
        "Exemplo 3: o CONTRATADO indica 3 pessoas e 2 têm o cadastro de cedente aprovado. Recebe 2 × R$ 40,00 = R$ 80,00, uma única vez.",
      ],
    },
    {
      titulo: "Cláusula 3 — Apuração e pagamento",
      itens: [
        "3.1. A remuneração é apurada por dia no sistema TradeMiles e paga por PIX à chave cadastrada pelo CONTRATADO. O extrato fica disponível no sistema.",
        "3.2. Do valor bruto é descontado o percentual de 15% (quinze por cento) referente aos tributos incidentes sobre a remuneração.",
        "3.3. Valores emprestados ou adiantados pela CONTRATANTE ao CONTRATADO, por acordo escrito, podem ser compensados com a remuneração, no percentual combinado no próprio acordo, até a quitação. A compensação aparece no extrato e não reduz o valor da comissão apurada.",
        "3.4. Venda cancelada antes do pagamento não gera comissão nem bônus. Cancelada depois do pagamento, a comissão paga é mantida, salvo quando o cancelamento decorrer de erro, culpa ou dolo do CONTRATADO (Cláusula 7).",
        "3.5. O CONTRATADO emite nota fiscal de serviço pelo seu MEI referente aos valores recebidos, mensalmente.",
      ],
    },
    {
      titulo: "Cláusula 4 — Taxas de embarque",
      itens: [
        "4.1. As taxas de embarque são pagas exclusivamente com os cartões dos sócios da CONTRATANTE ou da própria CONTRATANTE, cadastrados no sistema. O sistema já abre com o cartão padrão do sócio vinculado, e o CONTRATADO pode escolher outro cartão de sócio.",
        "4.2. É proibido pagar taxa de embarque, ou qualquer valor de emissão, com cartão próprio, de familiares, de clientes, de cedentes ou de terceiros.",
        "4.3. Valores pagos em desacordo com esta cláusula não são reembolsados, e eventuais prejuízos são tratados na forma da Cláusula 7.",
        "4.4. Os dados dos cartões são confidenciais: o CONTRATADO não pode copiá-los, fotografá-los, salvá-los fora do sistema ou usá-los para outro fim.",
      ],
    },
    {
      titulo: "Cláusula 5 — Cedentes e clientes",
      itens: [
        "5.1. Cedentes e clientes são da CONTRATANTE e ficam vinculados aos seus sócios, inclusive os indicados pelo CONTRATADO. O CONTRATADO não adquire direito sobre essa carteira nem sobre as contas de programas de fidelidade.",
        "5.2. Durante o contrato e por 12 (doze) meses após o seu fim, o CONTRATADO não pode oferecer a cedentes ou clientes da CONTRATANTE serviços de compra, venda ou emissão de milhas, nem induzi-los a deixar de trabalhar com a CONTRATANTE.",
        "5.3. É proibido usar contas de cedentes para emissões que não sejam vendas registradas da CONTRATANTE.",
      ],
    },
    {
      titulo: "Cláusula 6 — Proteção de dados (LGPD) e sigilo",
      itens: [
        "6.1. O CONTRATADO trata dados pessoais somente para executar este contrato, seguindo as instruções da CONTRATANTE e a Lei nº 13.709/2018 (LGPD). A CONTRATANTE é a controladora; o CONTRATADO atua como operador.",
        "6.2. Estão protegidos: nomes, CPFs, datas de nascimento, documentos, telefones, e-mails e dados de viagem de clientes e passageiros; dados cadastrais, bancários e de contas de fidelidade de cedentes; logins, senhas e códigos de verificação; dados de cartões; preços, margens, relatórios e qualquer informação do sistema TradeMiles.",
        "6.3. É proibido: copiar, fotografar, imprimir, exportar ou salvar esses dados fora do sistema (inclusive em celular, planilhas, notas ou nuvem pessoal); compartilhar dados ou credenciais com qualquer pessoa sem necessidade para o serviço; usar os dados para fins próprios ou de terceiros; entrar em contas de cedentes fora de uma emissão registrada; alterar senha, e-mail, telefone ou dados de contas de cedentes; informar ao cliente qual cedente ou conta foi usada; emprestar o acesso ao sistema ou deixá-lo aberto sem supervisão.",
        "6.4. O CONTRATADO mantém seus equipamentos com senha e bloqueio de tela, não usa computadores públicos e mantém em sigilo sua senha e seu autenticador.",
        "6.5. Qualquer suspeita de vazamento, perda de aparelho, acesso indevido ou envio de dados à pessoa errada deve ser comunicada diretamente aos sócios da CONTRATANTE em até 24 (vinte e quatro) horas, com a descrição do ocorrido.",
        "6.6. No fim do contrato, o CONTRATADO devolve ou apaga, em até 48 horas, todo dado da CONTRATANTE que tiver consigo, e o acesso ao sistema é encerrado.",
        "6.7. As obrigações desta cláusula valem por 5 (cinco) anos após o fim do contrato, e por prazo indeterminado quanto a senhas e dados bancários.",
        "6.8. O descumprimento desta cláusula sujeita o CONTRATADO à rescisão imediata do contrato e à responsabilização civil e criminal, incluindo a indenização integral dos prejuízos causados à CONTRATANTE, aos clientes e aos cedentes.",
      ],
    },
    {
      titulo: "Cláusula 7 — Obrigações e responsabilidade por erros",
      itens: [
        "7.1. Antes de emitir, o CONTRATADO confere com o cliente, pelo Telegram, nome completo, CPF, data de nascimento, trecho, datas e horários.",
        "7.2. O CONTRATADO respeita o limite de passageiros (CPFs) de cada conta e os alertas do sistema, e não emite por contas bloqueadas ou com risco de bloqueio sem autorização de um sócio.",
        "7.3. Toda emissão é registrada no sistema no mesmo dia, com localizador, comprovante, cliente e cartão da taxa. Depois de emitir, o CONTRATADO envia ao cliente o localizador e o comprovante.",
        "7.4. Cancelamentos seguem a política da CONTRATANTE: multa por passageiro informada ao cliente antes do cancelamento e devolução do restante; isenção de multa só com autorização de um sócio.",
        "7.5. Prejuízos causados por erro grave, culpa ou dolo do CONTRATADO (por exemplo: emissão com nome errado não conferido, venda abaixo do custo sem autorização, uso de cartão não autorizado, bloqueio de conta por desrespeito ao limite de CPFs) podem ser cobrados do CONTRATADO após apuração e comunicação por escrito, inclusive por compensação com a remuneração.",
        "7.6. Problemas com contas, biometria ou sistema são registrados em \"Relato de problemas\" ou comunicados ao sócio vinculado.",
      ],
    },
    {
      titulo: "Cláusula 8 — Prazo, rescisão e disposições gerais",
      itens: [
        "8.1. O contrato vale por prazo indeterminado, a partir do aceite, e pode ser encerrado por qualquer das partes com aviso prévio de 7 (sete) dias.",
        "8.2. A CONTRATANTE pode rescindir imediatamente, sem aviso prévio, em caso de descumprimento das Cláusulas 4, 5 ou 6, ou de fraude.",
        "8.3. Na rescisão, são pagas as comissões e bônus apurados até o último dia de serviço, descontados os valores devidos à CONTRATANTE.",
        "8.4. Este contrato não gera vínculo empregatício, societário ou de representação entre as partes.",
        "8.5. As regras operacionais (manual, bonificações extras, metas por lote) podem ser atualizadas pela CONTRATANTE com aviso prévio. Mudanças no percentual do C1, do C2 ou no valor por indicação exigem novo aceite.",
        "8.6. Fica eleito o foro da comarca de Goiânia/GO para resolver questões deste contrato.",
      ],
    },
    {
      titulo: "Aceite eletrônico",
      itens: [
        "O CONTRATADO declara que leu e aceita integralmente este contrato. O aceite é feito eletronicamente no cadastro do sistema TradeMiles, com registro de data, hora, endereço IP, navegador e versão do texto, e tem a mesma validade de uma assinatura (art. 10, § 2º, da MP nº 2.200-2/2001).",
      ],
    },
  ];
}

export function contratoTexto(secoes: ContratoSecao[]) {
  return secoes.map((s) => `${s.titulo}\n\n${s.itens.join("\n\n")}`).join("\n\n\n");
}
