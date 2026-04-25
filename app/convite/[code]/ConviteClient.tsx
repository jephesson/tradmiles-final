"use client";

import { useEffect, useState } from "react";

type PixTipo = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA" | "";

type FormState = {
  nomeCompleto: string;
  dataNascimento: string; // DD/MM/AAAA
  cpf: string;

  // ✅ ADICIONADO
  telefone: string;

  emailCriado: string;
  senhaEmail: string;

  senhaSmiles: string;
  senhaLatamPass: string;
  senhaLivelo: string;
  senhaEsfera: string;

  chavePix: string;
  banco: string;
  pixTipo: PixTipo;

  pontosLatam: number | "";
  pontosSmiles: number | "";
  pontosLivelo: number | "";
  pontosEsfera: number | "";
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}
function normalizeCpf(v: string) {
  return onlyDigits(v).slice(0, 11);
}

// ✅ ADICIONADO (Brasil: normalmente 10 ou 11 dígitos com DDD)
function normalizeTelefone(v: string) {
  return onlyDigits(v).slice(0, 11);
}

function normalizeDateBR(v: string) {
  const cleaned = (v || "").replace(/[^\d/]/g, "");
  const digits = cleaned.replace(/\//g, "");
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  let out = d;
  if (digits.length > 2) out += "/" + m;
  if (digits.length > 4) out += "/" + y;
  return out.slice(0, 10);
}
function brToIsoDate(br: string): string | null {
  const v = (br || "").trim();
  if (!v) return null;
  const parts = v.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return null;

  const d = Number(dd);
  const m = Number(mm);
  const y = Number(yyyy);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return null;
  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  return `${yyyy}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatFieldValue(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function formatCedenteStatus(status: DuplicateCedente["status"]) {
  if (status === "APPROVED") return "Aprovado";
  if (status === "REJECTED") return "Rejeitado";
  return "Pendente";
}

type InviteResp = {
  ok: boolean;
  error?: string;
  data?: {
    inviteId: string;
    code: string;
    uses: number;
    lastUsedAt: string | null;
    responsavel: {
      id: string;
      name: string;
      login: string;
      employeeId: string | null;
      team: string;
      role: string;
    };
  };
};

type Responsavel = NonNullable<InviteResp["data"]>["responsavel"];

type DuplicateCedente = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  telefone: string | null;
  emailCriado: string | null;
  banco: string;
  pixTipo: Exclude<PixTipo, "">;
  chavePix: string;
  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  owner: { id: string; name: string; login: string };
  createdAt: string;
  updatedAt: string;
};

type CedenteSignupResp = {
  ok: boolean;
  error?: string;
  data?: { id: string; identificador: string; updatedExisting?: boolean };
  duplicate?: DuplicateCedente | null;
  updateAllowed?: boolean;
};

const TERMO_VERSAO = "v3-2026-04";
const ORIENTACOES_VERSAO = "v1-2026-04";

const PROGRAMAS_FIDELIDADE = [
  { nome: "LATAM Pass", url: "https://latampass.latam.com/pt_br/" },
  { nome: "Livelo", url: "https://livelo.com.br/" },
  { nome: "Esfera", url: "https://www.esfera.com.vc/" },
  { nome: "Smiles", url: "https://www.smiles.com.br/home" },
] as const;

const ORIENTACOES_TEXTO = `ORIENTAÇÕES PARA CADASTRO NOS PROGRAMAS DE FIDELIDADE
VIAS AÉREAS VIAGENS E TURISMO LTDA

Olá! Para participar das operações da Vias Aéreas, será necessário criar ou disponibilizar contas em programas de fidelidade utilizados para compra, transferência e emissão de passagens com pontos/milhas.

Os cadastros podem ser feitos tanto pelo aplicativo oficial de cada programa quanto pelo navegador de internet, acessando os sites oficiais informados abaixo.

1. CRIAÇÃO DE E-MAIL EXCLUSIVO

O participante deverá criar um e-mail exclusivo para utilização nas operações dos programas de fidelidade.

Esse e-mail será utilizado para cadastro, recebimento de notificações, confirmações de segurança e recuperação de acesso das contas.

Recomendamos que o e-mail criado:

Seja novo e exclusivo para essa finalidade;
Não seja o e-mail pessoal principal do participante;
Não contenha senhas já utilizadas em outros serviços;
Seja informado corretamente no cadastro da Vias Aéreas;
Permita acesso pela equipe da Vias Aéreas, quando necessário para fins operacionais.

Exemplo de e-mail:

nome.sobrenome.viagens@gmail.com

A senha do e-mail deverá ser criada exclusivamente para essa finalidade e não deve ser igual a senhas pessoais, bancárias, redes sociais, gov.br ou outros serviços do participante.

2. NÚMERO DE TELEFONE COM SMS E WHATSAPP

O participante deverá possuir um número de telefone ativo, capaz de receber:

SMS;
Ligações;
Mensagens por WhatsApp;
Códigos de verificação;
Confirmações de segurança.

Esse número será utilizado pelos programas de fidelidade para validações de identidade e segurança.

É importante que o telefone esteja sempre acessível, pois em algumas operações podem ser solicitados códigos por SMS ou confirmações rápidas.

A demora no envio de códigos ou ausência de resposta poderá prejudicar a operação e afetar o score interno da conta.

3. PROGRAMAS QUE DEVEM SER CADASTRADOS

O participante deverá criar cadastro nos seguintes programas de fidelidade:

LATAM Pass
Livelo
Esfera
Smiles

O cadastro também pode ser feito pelo aplicativo oficial de cada programa, disponível para celular.

Sempre que possível, os cadastros devem ser feitos com os mesmos dados pessoais do titular:

Nome completo;
CPF;
Data de nascimento;
E-mail criado para a operação;
Número de telefone ativo;
Endereço atualizado.

Os dados devem ser verdadeiros e compatíveis com os documentos do titular.

Informações incorretas, divergentes ou incompletas podem gerar bloqueios, auditorias ou dificuldade de validação nas plataformas.

4. CADASTRO NA LATAM PASS

O participante deverá criar sua conta na LATAM Pass pelo aplicativo oficial ou pelo navegador de internet.

Durante o cadastro, poderá ser solicitado:

CPF;
Nome completo;
Data de nascimento;
E-mail;
Telefone;
Endereço;
Criação de senha;
Confirmação por SMS ou e-mail.

O participante declara ciência de que a LATAM Pass poderá solicitar validações adicionais, incluindo biometria facial, selfie, documento de identificação, SMS ou outros mecanismos de segurança.

Caso a conta seja utilizada em operação da Vias Aéreas e seja solicitada biometria, o participante deverá realizar a validação conforme previsto no Termo de Ciência e Autorização.

5. CADASTRO NA LIVELO

O participante deverá criar sua conta na Livelo pelo aplicativo oficial ou pelo navegador de internet.

Durante o cadastro, poderá ser solicitado:

CPF;
Nome completo;
E-mail;
Telefone;
Data de nascimento;
Criação de senha;
Confirmação por SMS ou e-mail.

Após concluir o cadastro, o participante deverá guardar as credenciais criadas para posterior preenchimento no link de convite/cadastro da Vias Aéreas.

6. CADASTRO NA ESFERA

O participante deverá criar sua conta na Esfera pelo aplicativo oficial ou pelo navegador de internet.

Durante o cadastro, poderá ser solicitado:

CPF;
Nome completo;
E-mail;
Telefone;
Data de nascimento;
Criação de senha;
Confirmação por SMS ou e-mail.

Após concluir o cadastro, o participante deverá guardar as credenciais criadas para posterior preenchimento no link de convite/cadastro da Vias Aéreas.

7. CADASTRO NA SMILES

O participante deverá criar sua conta na Smiles pelo aplicativo oficial ou pelo navegador de internet.

Durante o cadastro, poderá ser solicitado:

CPF;
Nome completo;
Data de nascimento;
E-mail;
Telefone;
Endereço;
Criação de senha;
Confirmação por SMS ou e-mail.

O participante declara ciência de que a Smiles poderá realizar auditorias, bloqueios preventivos ou solicitações adicionais de documentos, especialmente após adesão a clubes, compras promocionais, movimentações de pontos ou emissões.

Caso isso ocorra, o participante deverá colaborar com o envio dos documentos e confirmações necessárias para desbloqueio da conta.

8. PREENCHIMENTO DAS CREDENCIAIS NO LINK DE CONVITE DA VIAS AÉREAS

Após criar os cadastros nos programas de fidelidade, o participante deverá retornar ao link de convite/cadastro da Vias Aéreas e preencher as credenciais criadas nos campos indicados.

As informações poderão incluir:

Programa de fidelidade;
Login;
E-mail cadastrado;
Senha criada;
Número de telefone vinculado;
Observações relevantes, se houver.

As credenciais devem ser preenchidas exclusivamente nos campos do próprio link de convite/cadastro da Vias Aéreas.

O participante deve evitar o envio de senhas, prints, dados de acesso ou informações sensíveis por WhatsApp, mensagens, redes sociais ou outros canais informais.

O participante deverá utilizar senhas criadas exclusivamente para essas contas, não devendo repetir senhas pessoais, bancárias, profissionais, redes sociais, gov.br ou contas de uso privado.

Ao preencher as credenciais no link de convite/cadastro, o participante declara que as informações são verdadeiras, atualizadas e correspondem às contas criadas em seu próprio nome.

9. CUIDADOS IMPORTANTES DE SEGURANÇA

Para segurança do participante, recomendamos:

Não utilizar senha pessoal já usada em outros serviços;
Não cadastrar e-mail pessoal principal;
Não informar senha de banco, cartão, gov.br ou aplicativos financeiros;
Não enviar documentos fora dos canais orientados pela Vias Aéreas;
Manter o telefone ativo para recebimento de SMS e WhatsApp;
Informar imediatamente caso perca acesso ao e-mail ou telefone cadastrado.

A Vias Aéreas não solicita dados bancários sensíveis, senhas de banco, senhas de cartão, código de segurança de cartão, acesso a aplicativo bancário ou qualquer valor financeiro do participante.

A Vias Aéreas também não solicita dinheiro, PIX, transferência, depósito, pagamento antecipado ou qualquer investimento financeiro. Todo investimento para compra de pontos/milhas é feito exclusivamente pela empresa.

10. RESPONSABILIDADE SOBRE OS DADOS INFORMADOS

O participante declara que os dados utilizados nos cadastros são verdadeiros, atualizados e pertencem ao próprio titular.

Não é permitido cadastrar contas com dados de terceiros sem autorização.

O participante também declara ciência de que divergências cadastrais podem causar bloqueios, atrasos, auditorias ou impedimento de utilização da conta.

11. COLABORAÇÃO COM VALIDAÇÕES

Após a criação das contas, os programas poderão solicitar validações a qualquer momento.

Essas validações podem incluir:

Código por SMS;
Código por e-mail;
Confirmação por WhatsApp;
Selfie;
Biometria facial;
Documento de identificação;
Comprovante de residência;
Ligação de confirmação;
Auditoria cadastral.

O participante compromete-se a colaborar com essas validações sempre que solicitado, de forma ágil e verdadeira.

A agilidade no envio de códigos, documentos e confirmações poderá influenciar o score interno da Vias Aéreas e a prioridade da conta em futuras campanhas.

12. SCORE INTERNO E PRIORIDADE EM CAMPANHAS

A Vias Aéreas poderá manter um score interno para avaliar a confiabilidade operacional da conta.

Esse score poderá considerar:

Agilidade nas respostas;
Envio rápido de SMS;
Realização de biometria quando solicitada;
Colaboração em auditorias;
Regularidade dos dados cadastrais;
Histórico de operações anteriores;
Ausência de recusas injustificadas;
Facilidade de comunicação pelo WhatsApp.

Contas com melhor score poderão ser priorizadas em campanhas promocionais da LATAM Pass, Smiles, Livelo e Esfera.

13. CONFIRMAÇÃO FINAL

Após criar os cadastros na LATAM Pass, Livelo, Esfera e Smiles, o participante deverá retornar ao link de convite/cadastro da Vias Aéreas e preencher as informações solicitadas.

Ao finalizar o preenchimento, o participante declara que:

Criou os cadastros com dados verdadeiros;
Utilizou e-mail e senha próprios para essa finalidade;
Possui telefone ativo para SMS e WhatsApp;
Está ciente da necessidade de colaborar com validações;
Está ciente de que não deve utilizar senhas pessoais, bancárias ou gov.br;
Está ciente de que a Vias Aéreas não solicita dinheiro, PIX, depósito, transferência ou investimento financeiro;
Autoriza a utilização operacional das contas conforme o Termo de Ciência e Autorização.`;

/**
 * ✅ TERMO COMPLETO (texto integral)
 * - fica no client só pra exibir pro cedente
 * - a prova/registro fica no backend com termoVersao + ip + userAgent
 */
const TERMO_TEXTO = `TERMO DE CIÊNCIA, AUTORIZAÇÃO E RESPONSABILIDADE OPERACIONAL
VIAS AÉREAS VIAGENS E TURISMO LTDA

Este Termo tem por finalidade registrar a ciência expressa, autorização e concordância do TITULAR da conta para participação nas operações comerciais realizadas pela VIAS AÉREAS VIAGENS E TURISMO LTDA, inscrita no CNPJ sob nº 63.817.773/0001-85, envolvendo programas de fidelidade, aquisição de pontos/milhas, validações de identidade, emissão de passagens e comercialização em plataformas especializadas.

A Vias Aéreas não solicita dinheiro, PIX, transferência, depósito, pagamento antecipado, investimento ou qualquer valor financeiro do TITULAR para participação nas operações. Todo investimento necessário para aquisição de pontos, adesão a clubes, compra de milhas ou realização das operações é feito exclusivamente pela Vias Aéreas, com recursos próprios.

1. OBJETO E FUNCIONAMENTO DAS OPERAÇÕES

A Vias Aéreas atua na intermediação, organização e comercialização de passagens aéreas emitidas por meio de programas de fidelidade, incluindo, mas não se limitando a:

Livelo;
LATAM Pass;
Smiles;
Outros programas parceiros ou equivalentes.

Para viabilizar operações com margem comercial, poderão ser necessárias as seguintes etapas:

Adesão a clubes de pontos/milhas;
Aquisição de pontos ou milhas com recursos próprios da Vias Aéreas;
Transferências internas de pontos;
Emissão de passagens aéreas;
Comercialização dessas passagens em balcões especializados de milhas;
Validações de identidade, SMS, biometria, documentação ou auditorias solicitadas pelos programas.

O TITULAR declara ciência de que a utilização da conta poderá ocorrer de acordo com as oportunidades comerciais, campanhas promocionais, margem de lucro estimada, disponibilidade da conta e regras internas dos programas de fidelidade.

2. DO INVESTIMENTO, AUSÊNCIA DE COBRANÇA E RISCO FINANCEIRO

Todo o capital utilizado para aquisição de pontos, adesão a clubes, compra de milhas ou realização de operações comerciais será de responsabilidade exclusiva da Vias Aéreas.

O TITULAR declara ciência expressa de que:

A Vias Aéreas não solicita dinheiro ao TITULAR;
A Vias Aéreas não solicita PIX ao TITULAR;
A Vias Aéreas não solicita transferência bancária ao TITULAR;
A Vias Aéreas não solicita depósito ao TITULAR;
A Vias Aéreas não solicita pagamento antecipado ao TITULAR;
A Vias Aéreas não solicita qualquer tipo de investimento financeiro ao TITULAR;
O TITULAR não realiza pagamento à Vias Aéreas;
O TITULAR não assume risco financeiro direto;
O TITULAR não participa do custo de aquisição dos pontos;
O TITULAR não possui obrigação de reembolsar a empresa por investimentos feitos regularmente;
Todo o risco financeiro do investimento é exclusivo da Vias Aéreas;
O TITULAR não é responsável por prejuízos decorrentes de variações comerciais, promoções, desvalorização de milhas, atrasos sistêmicos, cancelamentos ou falhas operacionais das plataformas.

Em média, cada operação poderá envolver a aquisição aproximada de 130.000 pontos/milhas, com investimento médio estimado de R$ 3.200,00 por parte da Vias Aéreas, podendo esse valor variar conforme promoções, campanhas, clubes, bonificações, regras vigentes dos programas e condições comerciais do momento.

O TITULAR declara ciência de que sua obrigação principal é colaborar com as validações necessárias para conclusão das operações previamente autorizadas, e não realizar qualquer pagamento financeiro à Vias Aéreas.

3. DO PAGAMENTO AO TITULAR

Os valores pagos ao TITULAR correspondem à remuneração pela autorização de uso operacional da conta, colaboração com validações e participação nas operações comerciais da Vias Aéreas.

O pagamento será realizado:

Exclusivamente ao TITULAR da conta;
Via PIX;
Em conta bancária de mesma titularidade;
Nunca em conta de terceiros.

No caso de operações envolvendo LATAM Pass, o pagamento regular ao TITULAR será de R$ 50,00 por bloco operacional de pontos/milhas adquirido ou utilizado pela Vias Aéreas.

Caso a operação LATAM exija biometria facial, será acrescentado o valor de R$ 30,00, totalizando R$ 80,00 para aquele bloco operacional.

O valor adicional de R$ 30,00 não corresponde ao pagamento por cada biometria individual, mas sim à remuneração complementar pelo conjunto operacional médio de validações biométricas necessárias para conclusão da operação vinculada àquele bloco de pontos/milhas.

Os valores de R$ 50,00 e R$ 80,00 representam valores médios e regulares praticados pela Vias Aéreas. Em campanhas promocionais mais agressivas, operações com maior margem de lucro, oportunidades comerciais específicas ou condições excepcionais de mercado, a Vias Aéreas poderá, a seu exclusivo critério, oferecer comissão superior ao TITULAR.

A definição do valor exato a ser pago em cada operação caberá exclusivamente à Vias Aéreas, conforme programa utilizado, campanha vigente, margem de lucro estimada, necessidade de validações e viabilidade comercial da operação.

O pagamento é feito por bloco de operação ou aquisição de pontos/milhas, conforme análise comercial da Vias Aéreas, não representando salário, vínculo empregatício, comissão fixa ou obrigação de pagamento recorrente.

4. DA AQUISIÇÃO DE PONTOS E AUTORIZAÇÃO DE INVESTIMENTO

O TITULAR declara estar ciente de que, após autorizar a Vias Aéreas a realizar investimento em sua conta, incluindo aquisição de pontos, adesão a clubes ou participação em campanhas promocionais, a empresa poderá assumir custos relevantes para viabilizar a operação.

A partir da autorização de investimento pela Vias Aéreas, o TITULAR compromete-se a colaborar com todas as etapas necessárias para conclusão da operação, incluindo validações por SMS, envio de documentos, confirmação de identidade, desbloqueios, auditorias e biometria facial, quando solicitados.

A recusa injustificada, omissão, atraso excessivo ou não colaboração após o investimento realizado poderá gerar prejuízo financeiro direto à Vias Aéreas e poderá resultar em:

Cancelamento imediato da parceria;
Exclusão definitiva do cadastro;
Impedimento de futuras negociações;
Remoção da conta da lista de contas aptas a novas operações.

Fica expressamente esclarecido que a colaboração exigida do TITULAR refere-se às validações operacionais necessárias à conclusão da operação, e não ao pagamento de valores, PIX, transferências ou qualquer aporte financeiro.

5. DAS VALIDAÇÕES DE IDENTIDADE, SMS E DOCUMENTAÇÃO

O TITULAR declara ciência de que as plataformas Livelo, LATAM Pass, Smiles e demais programas poderão solicitar, a qualquer tempo, validações adicionais de identidade, conforme suas próprias políticas internas.

Essas validações podem incluir, entre outras:

Documento oficial de identificação com foto, como RG ou CNH;
Documento emitido preferencialmente há menos de 10 anos;
Comprovante de residência atualizado;
Selfie para conferência facial;
Biometria facial;
Envio de códigos por SMS;
Confirmações por ligação telefônica;
Confirmações por aplicativos oficiais;
Questionários, auditorias ou conferências de segurança.

O TITULAR compromete-se a fornecer as validações necessárias de forma verdadeira, tempestiva e compatível com as solicitações das plataformas.

A negativa, omissão, atraso injustificado ou fornecimento incorreto de informações poderá resultar em bloqueio, suspensão da conta, cancelamento de passagens, perda de oportunidade comercial e prejuízo financeiro à Vias Aéreas.

6. DA BIOMETRIA FACIAL NA LATAM PASS

No caso específico da LATAM Pass, o TITULAR declara ciência de que a biometria facial poderá ser obrigatória para viabilizar a emissão, venda ou utilização dos pontos da conta.

Nas operações LATAM, o pagamento regular será de R$ 50,00 por bloco operacional. Caso seja necessária a realização de biometria facial, será acrescido o valor de R$ 30,00, totalizando R$ 80,00 pelo bloco operacional vinculado àquela operação.

O acréscimo de R$ 30,00 refere-se ao conjunto médio de validações biométricas necessárias para conclusão da operação, e não a cada biometria realizada individualmente.

O TITULAR declara ciência de que, após a Vias Aéreas realizar investimento na conta, comprar pontos, aderir a clubes ou iniciar operação comercial, não poderá se recusar injustificadamente a realizar as biometrias necessárias para conclusão da operação.

A recusa, omissão, atraso injustificado ou não realização das biometrias solicitadas poderá gerar prejuízo financeiro direto à Vias Aéreas, especialmente porque a empresa já poderá ter realizado investimento médio aproximado de R$ 3.200,00 por bloco de pontos/milhas adquirido.

Nessas hipóteses, a Vias Aéreas poderá:

Encerrar imediatamente a parceria operacional;
Excluir definitivamente o TITULAR do cadastro;
Impedir futuras compras, indicações ou negociações;
Priorizar outras contas mais colaborativas em campanhas futuras.

7. DAS AUDITORIAS E BLOQUEIOS NA SMILES

O TITULAR declara ciência de que, no programa Smiles, algumas contas poderão passar por auditoria, especialmente após adesão a clubes, compras promocionais, transferências, emissões ou movimentações consideradas relevantes pela plataforma.

Durante eventual auditoria, a conta poderá sofrer:

Bloqueio temporário;
Restrição de emissão;
Solicitação de documentos;
Solicitação de confirmação cadastral;
Cancelamento ou análise de passagens;
Necessidade de contato com a central oficial da Smiles.

Caso a conta passe por auditoria, bloqueio ou solicitação de documentação, o TITULAR compromete-se a colaborar com o envio dos documentos e informações necessárias para desbloqueio da conta e regularização da operação.

A recusa injustificada, omissão ou atraso no fornecimento dos documentos solicitados poderá resultar em prejuízo à Vias Aéreas, cancelamento de operações em andamento e exclusão definitiva do TITULAR da parceria.

8. DO SCORE INTERNO DA VIAS AÉREAS

A Vias Aéreas poderá manter um score interno operacional dos titulares cadastrados, utilizado exclusivamente para organização, priorização e seleção de contas em campanhas futuras.

Esse score poderá considerar diversos fatores, incluindo, mas não se limitando a:

Agilidade para responder mensagens;
Cumprimento de validações por SMS;
Disponibilidade para realizar biometria facial;
Envio correto e rápido de documentos;
Histórico de colaboração em auditorias;
Ausência de recusas injustificadas;
Confiabilidade operacional da conta;
Participação anterior em campanhas;
Capacidade de viabilizar operações com segurança.

O TITULAR declara ciência de que esse score interno poderá influenciar a prioridade da conta em campanhas promocionais da LATAM Pass, Smiles, Livelo ou outros programas.

Contas com maior colaboração, agilidade e confiabilidade poderão ser priorizadas em novas compras de pontos, campanhas promocionais e oportunidades futuras.

Contas com atrasos recorrentes, recusas, falta de resposta, descumprimento de validações ou baixa colaboração poderão deixar de ser priorizadas ou ser removidas definitivamente do cadastro operacional.

9. DA PROTEÇÃO E TRATAMENTO DE DADOS

Os dados pessoais fornecidos pelo TITULAR serão utilizados exclusivamente para fins operacionais relacionados às atividades descritas neste termo, incluindo cadastro, validação, organização interna, controle de operações e comunicação com o TITULAR.

Os dados poderão incluir:

Nome completo;
CPF;
Telefone;
E-mail;
Dados bancários para pagamento;
Dados de acesso ou identificação dos programas de fidelidade, quando necessários;
Documentos enviados voluntariamente para validação ou desbloqueio.

Os dados serão armazenados em ambiente seguro, em banco de dados protegido da Vias Aéreas, incluindo armazenamento em ambiente corporativo seguro, como OneDrive corporativo ou ferramenta equivalente.

O TITULAR poderá solicitar, a qualquer momento, a exclusão definitiva de seus dados, ciente de que a exclusão poderá implicar:

Encerramento definitivo da parceria;
Impossibilidade de novas operações;
Remoção do cadastro da empresa;
Impossibilidade de novas indicações;
Perda de histórico operacional e score interno.

A exclusão dos dados poderá ser limitada quando houver necessidade de preservação de informações para cumprimento de obrigação legal, regulatória, contábil, fiscal, defesa de direitos ou comprovação de operações já realizadas.

10. DA INDICAÇÃO DE NOVOS CEDENTES

A Vias Aéreas poderá pagar ao TITULAR o valor de R$ 20,00 por indicação válida de novo cedente, desde que o indicado seja aprovado, cadastrado e considerado apto para participação nas operações.

A indicação somente será considerada válida após análise interna da Vias Aéreas.

Caso o cedente indicado descumpra este termo, recuse validações, gere prejuízo operacional ou financeiro, ou apresente conduta incompatível com a parceria, o TITULAR que realizou a indicação poderá ficar impedido de realizar novas indicações.

A Vias Aéreas reserva-se o direito de aceitar, recusar ou suspender indicações conforme critérios internos de segurança, confiabilidade e viabilidade operacional.

11. DA RESCISÃO E ENCERRAMENTO DA PARCERIA

Este termo poderá ser rescindido a qualquer momento por qualquer das partes.

Caso o TITULAR opte por não prosseguir com a parceria antes de qualquer investimento realizado pela Vias Aéreas, o vínculo poderá ser encerrado sem penalidade.

Caso já tenha havido aquisição de pontos, adesão a clubes, investimento financeiro, emissão de passagens ou operação em andamento, o TITULAR compromete-se a colaborar com as etapas necessárias para finalização da operação, a fim de evitar prejuízo financeiro à Vias Aéreas.

A Vias Aéreas poderá encerrar imediatamente a parceria em caso de:

Recusa injustificada de biometria;
Recusa de envio de documentos;
Não colaboração em auditorias;
Atrasos recorrentes;
Falta de resposta;
Fornecimento de informações falsas;
Risco operacional relevante;
Descumprimento deste termo.

O encerramento da parceria poderá resultar na exclusão definitiva do cadastro e impedimento de futuras negociações.

12. DO IMPOSTO DE RENDA E AUSÊNCIA DE VÍNCULO EMPREGATÍCIO

Os valores eventualmente recebidos pelo TITULAR possuem caráter eventual e não configuram vínculo empregatício, sociedade, representação comercial, prestação de serviço contínua ou relação de subordinação com a Vias Aéreas.

Cabe ao TITULAR avaliar eventual necessidade de declaração dos valores recebidos perante a Receita Federal, conforme sua realidade fiscal e legislação aplicável.

A Vias Aéreas não se responsabiliza por obrigações tributárias pessoais do TITULAR.

13. DA VERACIDADE DAS INFORMAÇÕES

O TITULAR declara que todas as informações fornecidas à Vias Aéreas são verdadeiras, completas e atualizadas.

O fornecimento de informações falsas, documentos inconsistentes, dados bancários de terceiros ou informações divergentes poderá resultar no encerramento imediato da parceria e exclusão definitiva do cadastro.

14. DA CIÊNCIA SOBRE RISCOS OPERACIONAIS DAS PLATAFORMAS

O TITULAR declara ciência de que os programas de fidelidade, companhias aéreas e plataformas parceiras possuem regras próprias, políticas internas de segurança, mecanismos antifraude e critérios independentes de validação.

Assim, podem ocorrer situações como:

Bloqueio temporário da conta;
Solicitação de documentação adicional;
Suspensão de emissões;
Cancelamento de passagens;
Auditoria de movimentações;
Exigência de confirmação por SMS;
Exigência de biometria facial;
Alteração de regras promocionais;
Indisponibilidade temporária de sistemas.

O TITULAR declara ciência de que tais situações são determinadas pelas plataformas responsáveis e não pela Vias Aéreas, comprometendo-se a colaborar com as medidas necessárias para regularização das operações.

15. DA CIÊNCIA EXPRESSA E AUTORIZAÇÃO

Para fins de transparência, o TITULAR poderá consultar o perfil oficial da empresa no Instagram:

@viasaereastrip

Ao manifestar concordância com este termo, o TITULAR declara que:

Leu integralmente o presente documento;
Compreendeu o funcionamento das operações;
Entendeu que a Vias Aéreas poderá investir valores próprios na conta;
Entendeu que a Vias Aéreas não solicita dinheiro, PIX, transferência, depósito, pagamento antecipado ou qualquer investimento financeiro do TITULAR;
Está ciente de que todo risco financeiro do investimento é exclusivo da Vias Aéreas;
Está ciente da obrigação de colaborar com SMS, documentos, auditorias e biometria;
Está ciente de que a recusa injustificada após investimento poderá gerar exclusão definitiva;
Entendeu a existência de score interno operacional;
Está ciente de que os valores pagos podem variar conforme margem, campanha e viabilidade comercial;
Não sofreu indução, erro, coação ou pressão indevida;
Autoriza expressamente a utilização operacional da conta conforme descrito neste termo.

16. ACEITE

Declaro que li, compreendi e concordo com todos os termos acima.

Declaro, ainda, estar ciente de que a Vias Aéreas não solicita dinheiro, PIX, transferência, depósito, pagamento antecipado ou qualquer investimento financeiro para participação nas operações, sendo todo investimento realizado exclusivamente pela empresa.`;

export default function ConviteClient({ code }: { code: string }) {
  const [form, setForm] = useState<FormState>({
    nomeCompleto: "",
    dataNascimento: "",
    cpf: "",

    // ✅ ADICIONADO
    telefone: "",

    emailCriado: "",
    senhaEmail: "",
    senhaSmiles: "",
    senhaLatamPass: "",
    senhaLivelo: "",
    senhaEsfera: "",
    chavePix: "",
    banco: "",
    pixTipo: "",
    pontosLatam: "",
    pontosSmiles: "",
    pontosLivelo: "",
    pontosEsfera: "",
  });

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState("");
  const [responsavel, setResponsavel] = useState<Responsavel | null>(null);

  const [termoAceito, setTermoAceito] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    existing: DuplicateCedente;
    updateAllowed: boolean;
    error: string;
  } | null>(null);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm({
      nomeCompleto: "",
      dataNascimento: "",
      cpf: "",
      telefone: "",
      emailCriado: "",
      senhaEmail: "",
      senhaSmiles: "",
      senhaLatamPass: "",
      senhaLivelo: "",
      senhaEsfera: "",
      chavePix: "",
      banco: "",
      pixTipo: "",
      pontosLatam: "",
      pontosSmiles: "",
      pontosLivelo: "",
      pontosEsfera: "",
    });
    setTermoAceito(false);
  }

  function buildPayload(overrides?: {
    overwriteExisting?: boolean;
    existingCedenteId?: string;
  }) {
    return {
      nomeCompleto: form.nomeCompleto.trim(),
      cpf: normalizeCpf(form.cpf),
      dataNascimento: form.dataNascimento.trim() ? brToIsoDate(form.dataNascimento) : null,
      telefone: normalizeTelefone(form.telefone),
      emailCriado: form.emailCriado.trim() || null,
      banco: form.banco.trim(),
      pixTipo: form.pixTipo,
      chavePix: form.chavePix.trim(),
      senhaEmailEnc: form.senhaEmail || null,
      senhaSmilesEnc: form.senhaSmiles || null,
      senhaLatamPassEnc: form.senhaLatamPass || null,
      senhaLiveloEnc: form.senhaLivelo || null,
      senhaEsferaEnc: form.senhaEsfera || null,
      pontosLatam: Number(form.pontosLatam || 0),
      pontosSmiles: Number(form.pontosSmiles || 0),
      pontosLivelo: Number(form.pontosLivelo || 0),
      pontosEsfera: Number(form.pontosEsfera || 0),
      termoAceito: true,
      termoVersao: TERMO_VERSAO,
      titularConfirmado: true,
      overwriteExisting: Boolean(overrides?.overwriteExisting),
      existingCedenteId: overrides?.existingCedenteId || null,
    };
  }

  async function submitCadastro(overrides?: {
    overwriteExisting?: boolean;
    existingCedenteId?: string;
  }) {
    const res = await fetch(`/api/convites/${encodeURIComponent(code)}/cedentes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(overrides)),
    });

    const json: CedenteSignupResp = await res.json().catch(() => ({
      ok: false,
      error: "Falha ao cadastrar.",
    }));

    if (!json?.ok) {
      if (json?.duplicate) {
        setDuplicateInfo({
          existing: json.duplicate,
          updateAllowed: Boolean(json.updateAllowed),
          error:
            json.error ||
            "Encontramos um cadastro com este CPF. Revise os dados e, se fizer sentido, atualize o cadastro existente.",
        });
      }
      const err: any = new Error(json?.error || "Falha ao cadastrar.");
      err.isDuplicate = Boolean(json?.duplicate);
      throw err;
    }

    return json;
  }

  async function handleDuplicateUpdate() {
    if (!duplicateInfo?.updateAllowed) return;
    try {
      setSaving(true);
      const json = await submitCadastro({
        overwriteExisting: true,
        existingCedenteId: duplicateInfo.existing.id,
      });

      alert(json.data?.updatedExisting ? "Cadastro existente atualizado ✅" : "Cadastro enviado ✅");
      setDuplicateInfo(null);
      resetForm();
    } catch (e: any) {
      if (e?.isDuplicate) return;
      alert(e?.message || "Erro ao atualizar cadastro.");
    } finally {
      setSaving(false);
    }
  }

  async function loadInvite() {
    setLoadingInvite(true);
    setInviteError("");
    try {
      const res = await fetch(`/api/convites/${encodeURIComponent(code)}`, { cache: "no-store" });
      const json: InviteResp = await res.json();

      if (!json?.ok) throw new Error(json?.error || "Convite inválido.");
      if (!json.data?.responsavel) throw new Error("Convite inválido.");
      setResponsavel(json.data.responsavel);
    } catch (e: any) {
      setInviteError(e?.message || "Erro ao carregar convite.");
      setResponsavel(null);
    } finally {
      setLoadingInvite(false);
    }
  }

  useEffect(() => {
    loadInvite();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDuplicateInfo(null);

    if (!responsavel) return alert("Convite inválido.");
    if (!form.nomeCompleto.trim()) return alert("Informe o nome completo.");
    if (normalizeCpf(form.cpf).length !== 11) return alert("CPF inválido (11 dígitos).");

    // ✅ ADICIONADO (telefone obrigatório)
    const tel = normalizeTelefone(form.telefone);
    if (!tel) return alert("Informe o telefone.");
    if (!(tel.length === 10 || tel.length === 11)) return alert("Telefone inválido (DDD + número).");

    if (!form.banco.trim()) return alert("Informe o banco (pagamento apenas ao titular).");
    if (!form.pixTipo) return alert("Informe o tipo da chave PIX.");
    if (!form.chavePix.trim()) return alert("Informe a chave PIX do titular.");
    if (!termoAceito) return alert("Você precisa ler e aceitar o termo para continuar.");

    const isoNascimento = form.dataNascimento.trim() ? brToIsoDate(form.dataNascimento) : null;
    if (form.dataNascimento.trim() && !isoNascimento) {
      return alert("Data de nascimento inválida. Use DD/MM/AAAA.");
    }

    try {
      setSaving(true);
      const json = await submitCadastro();
      alert(json.data?.updatedExisting ? "Cadastro existente atualizado ✅" : "Cadastro enviado ✅");
      resetForm();
    } catch (e: any) {
      if (e?.isDuplicate) return;
      alert(e?.message || "Erro ao enviar.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">Carregando convite...</div>
      </div>
    );
  }

  if (inviteError || !responsavel) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-2xl">
          <h1 className="text-2xl font-bold mb-2">Convite inválido</h1>
          <p className="text-sm text-red-600">{inviteError || "Esse link não é válido ou está inativo."}</p>
          <button className="mt-4 rounded-xl border px-4 py-2 text-sm hover:bg-slate-50" onClick={loadInvite}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const responsavelLabel = responsavel.employeeId
    ? `${responsavel.employeeId} • ${responsavel.name}`
    : responsavel.name;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex justify-center p-4 pb-24 md:p-6 [&_input]:bg-white [&_input]:text-slate-900 [&_input::placeholder]:text-slate-400 [&_select]:bg-white [&_select]:text-slate-900">
      <div className="w-full max-w-3xl">
        <h1 className="mb-2 text-2xl font-bold text-center text-slate-900">Cadastro de cedente</h1>

        <div className="mb-6 rounded-2xl border bg-white p-4">
          <div className="text-sm font-semibold">Responsável</div>
          <div className="text-sm text-slate-600">{responsavelLabel}</div>
          <div className="text-xs text-slate-500 mt-1">(No caso: quem forneceu o link de indicação)</div>
        </div>

        <div className="mb-6 rounded-2xl border bg-white p-4 space-y-3">
          <div className="text-sm font-semibold">Orientações para cadastro nas plataformas</div>
          <div className="text-xs text-slate-500">Versão: {ORIENTACOES_VERSAO}</div>

          <div className="grid gap-2 md:grid-cols-2">
            {PROGRAMAS_FIDELIDADE.map((programa) => (
              <a
                key={programa.nome}
                href={programa.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border px-3 py-2 text-sm font-medium text-sky-700 hover:bg-slate-50"
              >
                {programa.nome}
              </a>
            ))}
          </div>

          <div className="rounded-xl border bg-slate-50 p-3 text-xs whitespace-pre-wrap leading-relaxed max-h-[360px] overflow-auto">
            {ORIENTACOES_TEXTO}
          </div>
        </div>

        {/* ✅ TERMO + ACEITE */}
        <div className="mb-6 rounded-2xl border bg-white p-4 space-y-3">
          <div className="text-sm font-semibold">Termo de ciência e autorização</div>
          <div className="text-xs text-slate-500">Versão: {TERMO_VERSAO}</div>

          <div className="rounded-xl border bg-slate-50 p-3 text-xs whitespace-pre-wrap leading-relaxed max-h-[320px] overflow-auto">
            {TERMO_TEXTO}
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={termoAceito}
              onChange={(e) => setTermoAceito(e.target.checked)}
            />
            <span>
              Li e estou ciente do termo acima, e <b>autorizo expressamente</b> a utilização da minha conta conforme descrito.
            </span>
          </label>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <section className="rounded-2xl border bg-white p-4">
            <h2 className="mb-3 font-semibold">Dados</h2>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm">Nome completo</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.nomeCompleto}
                  onChange={(e) => setField("nomeCompleto", e.target.value)}
                  placeholder="Ex.: Maria Silva"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Data de nascimento (DD/MM/AAAA)</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.dataNascimento}
                  onChange={(e) => setField("dataNascimento", normalizeDateBR(e.target.value))}
                  placeholder="DD/MM/AAAA"
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">CPF</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.cpf}
                  onChange={(e) => setField("cpf", normalizeCpf(e.target.value))}
                  placeholder="Somente números"
                />
              </div>

              {/* ✅ ADICIONADO */}
              <div>
                <label className="mb-1 block text-sm">Telefone</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.telefone}
                  onChange={(e) => setField("telefone", normalizeTelefone(e.target.value))}
                  placeholder="DDD + número (somente números)"
                  inputMode="numeric"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-4">
            <h2 className="mb-3 font-semibold">Acessos e dados bancários</h2>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm">E-mail criado</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.emailCriado}
                  onChange={(e) => setField("emailCriado", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Senha do e-mail</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.senhaEmail}
                  onChange={(e) => setField("senhaEmail", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Senha Smiles</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.senhaSmiles}
                  onChange={(e) => setField("senhaSmiles", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Senha Latam Pass</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.senhaLatamPass}
                  onChange={(e) => setField("senhaLatamPass", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Senha Livelo</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.senhaLivelo}
                  onChange={(e) => setField("senhaLivelo", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Senha Esfera</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.senhaEsfera}
                  onChange={(e) => setField("senhaEsfera", e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm">Tipo de chave PIX</label>
                <select
                  className="w-full rounded-xl border px-3 py-2 bg-white"
                  value={form.pixTipo}
                  onChange={(e) => setField("pixTipo", e.target.value as PixTipo)}
                >
                  <option value="">Selecione</option>
                  <option value="CPF">CPF</option>
                  <option value="CNPJ">CNPJ</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="TELEFONE">Telefone</option>
                  <option value="ALEATORIA">Aleatória</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm">Chave PIX (do titular)</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.chavePix}
                  onChange={(e) => setField("chavePix", e.target.value)}
                  placeholder="CPF / e-mail / telefone / aleatória"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  Pagamento <b>somente ao titular</b>. Não será realizado pagamento em conta de terceiros.
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm">Banco</label>
                <input
                  className="w-full rounded-xl border px-3 py-2"
                  value={form.banco}
                  onChange={(e) => setField("banco", e.target.value)}
                  placeholder="Ex.: Nubank, Inter..."
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-4">
            <h2 className="mb-3 font-semibold">Pontos</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FieldNumber label="Latam" value={form.pontosLatam} onChange={(v) => setField("pontosLatam", v)} />
              <FieldNumber label="Smiles" value={form.pontosSmiles} onChange={(v) => setField("pontosSmiles", v)} />
              <FieldNumber label="Livelo" value={form.pontosLivelo} onChange={(v) => setField("pontosLivelo", v)} />
              <FieldNumber label="Esfera" value={form.pontosEsfera} onChange={(v) => setField("pontosEsfera", v)} />
            </div>
          </section>

          {duplicateInfo ? (
            <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-4">
              <div>
                <h2 className="font-semibold text-amber-900">Duplicidade encontrada</h2>
                <p className="text-sm text-amber-800">{duplicateInfo.error}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="mb-2 text-sm font-semibold">Cadastro atual</div>
                  <div className="space-y-1 text-sm text-slate-700">
                    <div><b>Nome:</b> {duplicateInfo.existing.nomeCompleto}</div>
                    <div><b>ID:</b> {duplicateInfo.existing.identificador}</div>
                    <div><b>Status:</b> {formatCedenteStatus(duplicateInfo.existing.status)}</div>
                    <div><b>Responsável:</b> @{duplicateInfo.existing.owner.login}</div>
                    <div><b>Telefone:</b> {formatFieldValue(duplicateInfo.existing.telefone)}</div>
                    <div><b>E-mail:</b> {formatFieldValue(duplicateInfo.existing.emailCriado)}</div>
                    <div><b>Banco:</b> {formatFieldValue(duplicateInfo.existing.banco)}</div>
                    <div><b>PIX:</b> {duplicateInfo.existing.pixTipo} • {formatFieldValue(duplicateInfo.existing.chavePix)}</div>
                    <div><b>Latam:</b> {duplicateInfo.existing.pontosLatam}</div>
                    <div><b>Smiles:</b> {duplicateInfo.existing.pontosSmiles}</div>
                    <div><b>Livelo:</b> {duplicateInfo.existing.pontosLivelo}</div>
                    <div><b>Esfera:</b> {duplicateInfo.existing.pontosEsfera}</div>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-white p-3">
                  <div className="mb-2 text-sm font-semibold">O que vai atualizar</div>
                  <div className="space-y-1 text-sm text-slate-700">
                    <FieldDiff label="Nome" current={duplicateInfo.existing.nomeCompleto} next={form.nomeCompleto.trim()} />
                    <FieldDiff label="Telefone" current={duplicateInfo.existing.telefone} next={normalizeTelefone(form.telefone)} />
                    <FieldDiff label="E-mail" current={duplicateInfo.existing.emailCriado} next={form.emailCriado.trim() || null} />
                    <FieldDiff label="Banco" current={duplicateInfo.existing.banco} next={form.banco.trim()} />
                    <FieldDiff label="PIX" current={`${duplicateInfo.existing.pixTipo} • ${duplicateInfo.existing.chavePix}`} next={`${form.pixTipo || "—"} • ${form.chavePix.trim() || "—"}`} />
                    <FieldDiff label="Latam" current={duplicateInfo.existing.pontosLatam} next={Number(form.pontosLatam || 0)} />
                    <FieldDiff label="Smiles" current={duplicateInfo.existing.pontosSmiles} next={Number(form.pontosSmiles || 0)} />
                    <FieldDiff label="Livelo" current={duplicateInfo.existing.pontosLivelo} next={Number(form.pontosLivelo || 0)} />
                    <FieldDiff label="Esfera" current={duplicateInfo.existing.pontosEsfera} next={Number(form.pontosEsfera || 0)} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {duplicateInfo.updateAllowed ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleDuplicateUpdate}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    {saving ? "Atualizando..." : "Atualizar cadastro existente"}
                  </button>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    Este CPF já está em um cadastro ativo. Revise o cadastro atual antes de prosseguir.
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setDuplicateInfo(null)}
                  className="rounded-xl border px-4 py-2 text-sm hover:bg-white"
                >
                  Fechar aviso
                </button>
              </div>
            </section>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-black px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {saving ? "Enviando..." : "Enviar cadastro"}
          </button>

          <div className="rounded-2xl border bg-white p-4 text-xs text-slate-600">
            <b>⚠️ Aviso:</b> por enquanto senhas estão sendo salvas em texto (como solicitado).
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm">{label}</label>
      <input
        type="number"
        min={0}
        className="w-full rounded-xl border px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </div>
  );
}

function FieldDiff({
  label,
  current,
  next,
}: {
  label: string;
  current: unknown;
  next: unknown;
}) {
  const currentLabel = formatFieldValue(current);
  const nextLabel = formatFieldValue(next);
  const changed = currentLabel !== nextLabel;

  return (
    <div className={changed ? "rounded-lg bg-emerald-50 px-2 py-1" : "rounded-lg px-2 py-1"}>
      <b>{label}:</b> {currentLabel} {" → "} {nextLabel}
      {changed ? <span className="ml-2 text-xs font-medium text-emerald-700">vai mudar</span> : null}
    </div>
  );
}
