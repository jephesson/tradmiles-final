// Textos prontos da fila de assinatura (formatação do WhatsApp: *negrito*).

function firstName(name: string | null | undefined) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

/** Primeira mensagem para o cedente: quem fala, de quem é sócio e como vai funcionar. */
export function mensagemInicioAtendimento(args: {
  cedenteNome: string;
  remetenteNome: string;
  responsavelNome?: string | null;
}) {
  const cedente = firstName(args.cedenteNome);
  const remetente = firstName(args.remetenteNome) || "a equipe da Vias Aéreas";
  const responsavel = firstName(args.responsavelNome);
  const socio =
    responsavel && responsavel !== remetente ? `, sócio do ${responsavel}` : ", da Vias Aéreas";

  return [
    `Olá${cedente ? `, ${cedente}` : ""}! Tudo bem? 😊`,
    `Aqui é o ${remetente}${socio}.`,
    "",
    "Vou iniciar o seu atendimento agora para darmos andamento ao *pagamento*. Funciona assim:",
    "",
    "1️⃣ Vou te mandar o *Termo Resumido de Ciência e Aceite*. É só ler e responder confirmando.",
    "2️⃣ A Vias Aéreas assina o clube e compra os pontos na sua conta. *Você não paga nada.*",
    "3️⃣ Quando houver emissões, vamos te pedir algumas *biometrias faciais* (em média 8 por bloco).",
    "4️⃣ Você recebe *R$ 80,00 por bloco* via PIX, na sua conta, geralmente entre 24h e 72h após a assinatura do clube e a compra dos pontos. Em média são R$ 80,00 por mês, por pelo menos 4 meses.",
    "",
    "Qualquer dúvida, é só me chamar por aqui! 🙌",
  ].join("\n");
}

export const TERMO_ACEITE = `📄 *TERMO RESUMIDO DE CIÊNCIA E ACEITE – VIAS AÉREAS*

Ao aceitar esta parceria com a *VIAS AÉREAS VIAGENS E TURISMO LTDA*, declaro estar ciente e de acordo com as seguintes condições:

1️⃣ *FINALIDADE:* A Vias Aéreas utilizará minha conta LATAM Pass para adquirir pontos, realizar emissões e comercializar passagens aéreas a seus clientes, conforme as regras da plataforma.

2️⃣ *BIOMETRIAS:* Estou ciente de que serão solicitadas, em média, 8 biometrias faciais por bloco operacional. Sempre que houver clientes comprando passagens que dependam da minha conta, poderei ser solicitado a realizar as biometrias e confirmações necessárias.

3️⃣ *PAGAMENTO:* Receberei R$ 80,00 por bloco operacional, contemplando todas as biometrias, emissões e confirmações necessárias naquele bloco. O pagamento será realizado via PIX, em conta de minha titularidade, geralmente entre 24h e 72h após a assinatura do clube e a compra dos pontos pela Vias Aéreas. Não há pagamento por biometria individual.

4️⃣ *PRAZO E MÉDIA MENSAL:* A parceria terá duração mínima de 4 (quatro) meses, com ganho médio de R$ 80,00 por mês durante esse período.

5️⃣ *DISPONIBILIDADE:* Comprometo-me a acompanhar as solicitações e não desaparecer ou abandonar operações após o investimento da empresa. Caso necessário, poderemos combinar previamente turnos ou horários específicos para a realização das biometrias.

6️⃣ *INVESTIMENTO:* Todos os custos com compra de pontos, clubes e operações serão de responsabilidade exclusiva da Vias Aéreas. Não precisarei realizar PIX, depósitos ou qualquer investimento financeiro.

7️⃣ *RESPONSABILIDADE:* Estou ciente de que, caso eu não cumpra as condições deste termo (biometrias, disponibilidade e colaboração), poderei ser retirado da parceria, com o encerramento das operações e a suspensão de futuras oportunidades.

8️⃣ *ACEITE:* Declaro que compreendi as condições acima e que minha participação é voluntária, estando ciente de que as operações também dependem das regras e validações da LATAM Pass.

✅ *Para confirmar sua concordância, responda a esta mensagem com:*

"LI E ACEITO as condições do Termo Resumido de Ciência e Aceite da Vias Aéreas. Estou ciente do pagamento de R$ 80,00 por bloco operacional, da média de R$ 80,00 por mês durante pelo menos 4 meses, da média de 8 biometrias e das minhas responsabilidades de disponibilidade e colaboração, podendo ser retirado da parceria caso não as cumpra."

VIAS AÉREAS VIAGENS E TURISMO LTDA
CNPJ: 63.817.773/0001-85`;
