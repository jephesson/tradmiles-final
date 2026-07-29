"use client";

import { type ReactNode, useEffect, useState } from "react";

type PixTipo = "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA" | "";

type FormState = {
  nomeCompleto: string;
  dataNascimento: string; // DD/MM/AAAA
  cpf: string;

  // ✅ ADICIONADO
  telefone: string;

  codigoCedenteIndicacao: string;

  emailCriado: string;
  senhaEmail: string;

  senhaLatamPass: string;
  senhaLivelo: string;

  chavePix: string;
  banco: string;
  pixTipo: PixTipo;

  pontosLatam: number | "";
  pontosLivelo: number | "";
};

function normalizeReferrerCodeInput(v: string) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

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

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

const TERMO_VERSAO = "v4-2026-07";
const ORIENTACOES_VERSAO = "v2-2026-07";

const PROGRAMAS_FIDELIDADE = [
  { nome: "LATAM Pass", url: "https://latampass.latam.com/pt_br/" },
  { nome: "Livelo", url: "https://livelo.com.br/" },
] as const;

const PALAVRAS_CHAVE_IMPORTANTES = [
  "LATAM Pass",
  "Livelo",
  "PIX",
  "SMS",
  "WhatsApp",
  "biometria facial",
  "bloco operacional",
  "score interno",
  "e-mail",
  "telefone",
  "CPF",
  "gov.br",
  "OneDrive",
  "R$ 20,00",
  "R$ 80,00",
  "não solicita dinheiro",
] as const;

const PALAVRAS_CHAVE_LOOKUP = new Set(
  [...PALAVRAS_CHAVE_IMPORTANTES].map((termo) => termo.toLowerCase())
);

const PALAVRAS_CHAVE_REGEX = new RegExp(
  `(${[...PALAVRAS_CHAVE_IMPORTANTES]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join("|")})`,
  "gi"
);

const ORIENTACOES_TEXTO = `ORIENTAÇÕES PARA CADASTRO NOS PROGRAMAS DE FIDELIDADE
VIAS AÉREAS VIAGENS E TURISMO LTDA

Para participar das operações da Vias Aéreas, o titular deverá criar ou disponibilizar contas nos programas Livelo e LATAM Pass, seguindo as orientações apresentadas nesta página.

Os cadastros deverão ser realizados com os dados verdadeiros do próprio titular.

Antes de prosseguir, leia todas as informações com atenção. Após a autorização, a Vias Aéreas poderá utilizar recursos próprios para comprar pontos, aderir a clubes, participar de campanhas e realizar emissões vinculadas às contas cadastradas.

Por esse motivo, o cadastro somente deverá ser concluído por quem realmente deseja participar e possui disponibilidade para colaborar com códigos, documentos, biometrias e demais validações necessárias.

1. CRIAÇÃO DE E-MAIL EXCLUSIVO

O titular deverá criar um e-mail novo e exclusivo para utilização nas operações da Vias Aéreas.

Esse e-mail poderá ser utilizado para:

Cadastro na Livelo e na LATAM Pass;
Recebimento de códigos;
Confirmações de segurança;
Notificações das plataformas;
Recuperação de acesso;
Comunicações relacionadas às contas;

O e-mail não deverá ser o endereço pessoal principal do titular.

Exemplo:

nome.sobrenome.viagens@gmail.com

A senha também deverá ser criada exclusivamente para essa finalidade.

Não utilize senhas iguais ou semelhantes às usadas em:

Bancos;
Cartões;
Aplicativos financeiros;
Gov.br;
Redes sociais;
E-mail pessoal;
Sistemas profissionais;
Outros serviços particulares;

O titular deverá manter o e-mail ativo durante todo o período de participação nas operações.

2. TELEFONE ATIVO E WHATSAPP

O titular deverá possuir um número de telefone ativo e sob seu controle, capaz de receber:

SMS;
Ligações;
Mensagens pelo WhatsApp;
Códigos de confirmação;
Solicitações de segurança;

O telefone deverá permanecer acessível durante as operações, pois alguns códigos possuem poucos minutos de validade.

O titular deverá salvar na agenda do celular o número do colaborador da Vias Aéreas responsável pelo seu atendimento.

Como medida de identificação e segurança, o WhatsApp utilizado pelo titular deverá possuir:

Nome de identificação;
Foto de perfil visível;
Número ativo para recebimento de mensagens;

Cadastros realizados com WhatsApp sem foto de perfil não serão aceitos.

A falta de resposta, a demora no envio de códigos ou a indisponibilidade frequente poderão impedir a conclusão da operação e afetar a prioridade da conta em campanhas futuras.

3. DADOS UTILIZADOS NOS CADASTROS

Os cadastros deverão ser realizados com os dados verdadeiros do titular:

Nome completo;
CPF;
Data de nascimento;
E-mail criado para a operação;
Número de telefone ativo;
Endereço atualizado, quando solicitado;

Os dados deverão ser compatíveis com os documentos pessoais do titular.

Informações incorretas, incompletas ou divergentes poderão causar:

Falha nas validações;
Bloqueio da conta;
Auditoria;
Dificuldade de recuperação de acesso;
Cancelamento de operações;
Impossibilidade de utilização da conta;

Não é permitido cadastrar contas utilizando dados ou documentos de terceiros sem autorização.

4. CADASTRO NA LIVELO

A conta Livelo deverá ser criada pelo aplicativo ou site oficial da plataforma.

Durante o cadastro, poderão ser solicitados:

CPF;
Nome completo;
Data de nascimento;
E-mail;
Telefone;
Criação de senha;
Confirmação por SMS ou e-mail;

Depois da criação da conta, poderá ser necessário alterar o número de telefone cadastrado para viabilizar as operações.

Essa alteração poderá exigir:

Código por SMS;
Selfie;
Biometria facial;
Confirmação de identidade;

Pagamento de entrada da Livelo:

O titular receberá R$ 20,00 pela entrada da conta Livelo.

O pagamento será realizado após a conclusão e aprovação do cadastro conforme as orientações da Vias Aéreas.

Esse valor já inclui a primeira biometria facial solicitada pela Livelo, ainda que a validação seja realizada em momento posterior ao cadastro.

A primeira biometria da Livelo não gera pagamento adicional além dos R$ 20,00 de entrada.

5. CADASTRO NA LATAM PASS

A conta LATAM Pass deverá ser criada pelo aplicativo ou site oficial da companhia.

Durante o cadastro, poderão ser solicitados:

CPF;
Nome completo;
Data de nascimento;
E-mail;
Telefone;
Endereço;
Criação de senha;
Confirmação por SMS ou e-mail;

A LATAM Pass também poderá solicitar:

Selfie;
Biometria facial;
Documento de identificação;
Código por SMS;
Confirmação por e-mail;
Outras verificações de segurança;

Quando a conta estiver vinculada a uma operação previamente autorizada, o titular deverá colaborar com as validações necessárias para conclusão das emissões.

6. PAGAMENTO DO BLOCO OPERACIONAL LATAM

Nas operações LATAM Pass, o titular receberá R$ 80,00 por bloco operacional.

O pagamento de R$ 80,00 abrange:

Todas as emissões realizadas dentro do bloco;
Todas as biometrias necessárias para essas emissões;
Códigos e confirmações solicitados durante a operação;
Disponibilidade do titular para acompanhar as validações;
Demais procedimentos necessários para conclusão do bloco;

Em média, cada bloco poderá exigir aproximadamente oito biometrias, mas a quantidade real poderá ser menor ou maior.

O valor de R$ 80,00 permanecerá o mesmo independentemente da quantidade de biometrias necessárias dentro daquele bloco.

Não haverá pagamento separado:

Por emissão individual;
Por passageiro;
Por selfie;
Por biometria individual;
Por código enviado;
Por tentativa de validação;
Por quantidade de validações dentro do mesmo bloco;

O que é um bloco operacional:

Para estas orientações, considera-se bloco operacional o conjunto de operações e emissões vinculadas à mesma aquisição ou utilização de pontos da conta.

O bloco será considerado concluído quando:

As emissões previstas forem finalizadas;
Os pontos destinados à operação forem utilizados;
A operação for encerrada pela Vias Aéreas;
Não houver mais emissões relacionadas àquela aquisição de pontos;

Caso uma nova aquisição de pontos dê início a outra operação, poderá ser formado um novo bloco, sujeito a nova remuneração.

7. DISPONIBILIDADE PARA AS BIOMETRIAS

Quando uma biometria for solicitada, o titular deverá estar:

Com o celular em mãos;
Conectado à internet;
Disponível para acompanhar as mensagens;
Em ambiente com boa iluminação;
Preparado para abrir o link de validação;
Com tempo para concluir o procedimento;

Em condições normais, cada procedimento deverá levar aproximadamente 5 minutos.

Durante esse período, o titular deverá permanecer online e acompanhar as orientações enviadas pelo colaborador responsável.

A biometria não deverá ser iniciada quando o titular estiver:

Dirigindo;
Sem acesso à internet;
Trabalhando sem poder utilizar o celular;
Em ambiente com iluminação inadequada;
Sem tempo para concluir;
Prestes a ficar indisponível;

8. CONFIRMAÇÃO ANTES DO INVESTIMENTO

Antes de autorizar a utilização da conta, o titular deverá ter certeza de que deseja participar da operação.

Após a autorização, a Vias Aéreas poderá utilizar recursos próprios para:

Comprar pontos;
Aderir a clubes;
Participar de campanhas;
Preparar a conta;
Realizar emissões;
Iniciar outras operações comerciais;

Depois que os pontos forem comprados ou outro investimento for realizado, o titular deverá colaborar com as validações necessárias para conclusão da operação.

A recusa injustificada, falta de resposta ou abandono da operação após o investimento poderá gerar prejuízo financeiro direto à Vias Aéreas.

Nessas situações, a empresa poderá:

Encerrar imediatamente a parceria;
Excluir definitivamente o cadastro;
Impedir novas operações;
Impedir novas indicações;
Retirar a conta de campanhas futuras;
Priorizar outros titulares;

Essa colaboração não envolve pagamento de dinheiro pelo titular.

Todo investimento necessário para compra de pontos e realização das operações é feito exclusivamente pela Vias Aéreas.

9. PREENCHIMENTO DAS CREDENCIAIS

Depois de criar as contas, o titular deverá retornar ao cadastro da Vias Aéreas e preencher as informações solicitadas pelo sistema.

Poderão ser solicitados:

Programa de fidelidade;
CPF ou login;
E-mail cadastrado;
Senha criada para a operação;
Número de telefone vinculado;
Outras informações necessárias;

As credenciais deverão ser preenchidas exclusivamente no ambiente indicado pela Vias Aéreas.

Não deverão ser utilizadas senhas pessoais, bancárias, profissionais ou do Gov.br.

A Vias Aéreas não solicita:

Senha de banco;
Senha de cartão;
Código de segurança de cartão;
Senha do Gov.br;
Acesso a aplicativo bancário;
Token de instituição financeira;

10. VALIDAÇÕES POSTERIORES

A Livelo e a LATAM Pass poderão solicitar novas validações a qualquer momento.

Essas validações poderão incluir:

Código por SMS;
Código por e-mail;
Selfie;
Biometria facial;
Documento de identificação;
Comprovante de residência;
Ligação de confirmação;
Auditoria cadastral;
Recuperação ou desbloqueio da conta;

O titular compromete-se a colaborar de forma verdadeira e ágil quando solicitado.

A agilidade nas respostas poderá influenciar a prioridade da conta em operações futuras.

11. SCORE INTERNO

A Vias Aéreas poderá manter um score interno para avaliar a confiabilidade operacional das contas cadastradas.

Esse score poderá considerar:

Agilidade nas respostas;
Rapidez no envio de códigos;
Disponibilidade para biometria;
Colaboração com documentos;
Regularidade dos dados;
Histórico de operações;
Ausência de recusas injustificadas;
Facilidade de comunicação;
Confiabilidade do titular;

Contas com melhor histórico de colaboração poderão ser priorizadas em novas campanhas da Livelo e da LATAM Pass.

12. SEGURANÇA DO TITULAR

A Vias Aéreas não solicita ao titular:

Dinheiro;
PIX;
Transferência;
Depósito;
Pagamento antecipado;
Investimento financeiro;
Senha bancária;
Senha de cartão;
Código de segurança;
Acesso ao aplicativo bancário;

Todo investimento necessário para compra de pontos, adesão a clubes ou realização das operações é feito exclusivamente pela Vias Aéreas.

Ao prosseguir com o cadastro no site, o titular confirma que leu estas orientações e compreendeu as condições para participação.`;

/**
 * ✅ TERMO COMPLETO (texto integral)
 * - fica no client só pra exibir pro cedente
 * - a prova/registro fica no backend com termoVersao + ip + userAgent
 */
const TERMO_TEXTO = `TERMO DE CIÊNCIA, AUTORIZAÇÃO E RESPONSABILIDADE OPERACIONAL
VIAS AÉREAS VIAGENS E TURISMO LTDA

Este Termo registra a ciência, autorização e concordância do TITULAR para participação nas operações comerciais realizadas pela VIAS AÉREAS VIAGENS E TURISMO LTDA, inscrita no CNPJ sob nº 63.817.773/0001-85.

As operações poderão envolver contas dos programas Livelo e LATAM Pass, aquisição de pontos ou milhas, adesão a clubes, validações de identidade, biometrias faciais, emissão de passagens e demais procedimentos necessários à conclusão das operações autorizadas.

A Vias Aéreas não solicita dinheiro, PIX, transferência, depósito, pagamento antecipado, investimento ou qualquer valor financeiro do TITULAR.

Todo investimento necessário será realizado exclusivamente pela Vias Aéreas, com recursos próprios.

1. OBJETO E FUNCIONAMENTO DAS OPERAÇÕES

O TITULAR autoriza a Vias Aéreas a realizar operações utilizando as contas cadastradas nos programas:

Livelo;
LATAM Pass;

As operações poderão ocorrer conforme:

Campanhas promocionais disponíveis;
Oportunidades comerciais;
Margem estimada;
Disponibilidade da conta;
Histórico operacional do TITULAR;
Regras dos programas;
Necessidade de validações;

As atividades poderão incluir:

Aquisição de pontos ou milhas;
Adesão a clubes;
Participação em campanhas;
Transferência de pontos;
Emissão de passagens;
Alteração de informações operacionais;
Confirmações por SMS;
Selfie ou biometria facial;
Envio de documentos;
Recuperação de acesso;
Auditorias e validações de segurança;

O TITULAR declara estar ciente de que a conta poderá ser utilizada conforme as oportunidades comerciais identificadas pela Vias Aéreas.

2. INVESTIMENTO E AUSÊNCIA DE COBRANÇA

Todo o capital necessário para aquisição de pontos, adesão a clubes e realização das operações será de responsabilidade exclusiva da Vias Aéreas.

O TITULAR declara estar ciente de que:

Não realizará pagamentos à Vias Aéreas;
Não enviará PIX;
Não realizará transferências ou depósitos;
Não pagará taxas de participação;
Não investirá dinheiro na compra de pontos;
Não assumirá os custos das operações;
Não deverá fornecer senhas bancárias;
Não deverá fornecer dados de cartão;

O TITULAR não será responsável por prejuízos comerciais normais relacionados a:

Variação no valor dos pontos;
Alteração ou encerramento de promoções;
Desvalorização de pontos ou milhas;
Falhas sistêmicas;
Indisponibilidade das plataformas;
Cancelamentos realizados pelos programas;
Mudanças nas regras das empresas envolvidas;

A principal obrigação do TITULAR será colaborar com as validações necessárias para conclusão das operações previamente autorizadas.

Uma operação poderá envolver investimento relevante por parte da Vias Aéreas, incluindo aquisição de pontos, adesão a clubes, pagamento de taxas e outras despesas necessárias.

3. PAGAMENTOS AO TITULAR

Os valores pagos ao TITULAR correspondem à remuneração pela entrada da conta Livelo e pela disponibilidade necessária para conclusão das operações realizadas na LATAM Pass.

O pagamento será realizado:

Exclusivamente ao TITULAR;
Por PIX;
Em conta bancária de mesma titularidade;
Nunca em conta pertencente a terceiros;

Os pagamentos possuem caráter eventual e não representam salário, remuneração mensal, comissão fixa ou garantia de recorrência.

4. PAGAMENTO DE ENTRADA DA LIVELO

O TITULAR receberá R$ 20,00 pela entrada da conta Livelo.

O pagamento será realizado após a conclusão e aprovação do cadastro, conforme os critérios operacionais da Vias Aéreas.

O valor de R$ 20,00 inclui:

Criação ou disponibilização da conta Livelo;
Preparação inicial da conta;
Disponibilidade inicial do TITULAR;
Eventual alteração do número de telefone;
Primeira biometria facial solicitada pela Livelo;

A primeira biometria da Livelo estará incluída nesse valor, ainda que seja realizada em momento posterior ao cadastro inicial.

A primeira biometria da Livelo não gerará pagamento adicional.

5. PAGAMENTO DO BLOCO OPERACIONAL LATAM

Nas operações realizadas por meio da LATAM Pass, o TITULAR receberá R$ 80,00 por bloco operacional.

Esse pagamento abrange:

Todas as emissões realizadas dentro do bloco;
Todas as biometrias necessárias para essas emissões;
Todos os códigos e confirmações solicitados;
A disponibilidade do TITULAR durante a operação;
As demais validações necessárias para conclusão do bloco;

Em média, cada bloco poderá exigir aproximadamente oito biometrias faciais, mas a quantidade efetiva poderá ser menor ou maior.

O valor de R$ 80,00 permanecerá fixo independentemente da quantidade de:

Emissões;
Passageiros;
Biometrias;
Selfies;
Códigos;
Confirmações;
Outras validações necessárias dentro do mesmo bloco;

Não haverá pagamento separado ou adicional por cada emissão, biometria, passageiro, selfie, código ou validação realizada dentro do bloco.

O pagamento de R$ 80,00 remunera o conjunto completo de operações e validações necessárias para conclusão daquele bloco.

6. DEFINIÇÃO E ENCERRAMENTO DO BLOCO OPERACIONAL

Para fins deste Termo, considera-se bloco operacional o conjunto de operações e emissões vinculadas à mesma aquisição ou utilização de pontos na conta LATAM Pass.

O bloco poderá incluir diversas emissões realizadas em momentos diferentes, desde que relacionadas à mesma operação ou saldo de pontos destinado pela Vias Aéreas.

O bloco será considerado concluído quando:

As emissões previstas forem finalizadas;
Os pontos destinados à operação forem utilizados;
Não houver mais emissões relacionadas àquela aquisição;
A operação for formalmente encerrada pela Vias Aéreas;

Caso uma nova aquisição de pontos dê início a uma operação independente, poderá ser formado um novo bloco operacional, sujeito a nova remuneração de R$ 80,00.

A quantidade média de oito biometrias é apenas uma estimativa operacional e não representa quantidade mínima ou máxima garantida.

7. DISPONIBILIDADE PARA AS BIOMETRIAS

Quando uma biometria for solicitada, o TITULAR deverá estar:

Com o celular em mãos;
Conectado à internet;
Disponível para acompanhar as mensagens;
Em ambiente com boa iluminação;
Preparado para abrir o link;
Com tempo suficiente para concluir o procedimento;

Em condições normais, cada biometria deverá levar aproximadamente 5 minutos.

Durante esse período, o TITULAR deverá permanecer online e acompanhar as orientações do colaborador responsável.

O TITULAR compromete-se a não iniciar a validação caso esteja:

Dirigindo;
Sem acesso à internet;
Trabalhando sem poder utilizar o telefone;
Em ambiente inadequado;
Sem tempo para concluir;
Prestes a ficar indisponível;

8. AUTORIZAÇÃO PARA INVESTIMENTO

O TITULAR declara estar ciente de que, após autorizar uma operação, a Vias Aéreas poderá utilizar recursos próprios para:

Comprar pontos ou milhas;
Aderir a clubes;
Participar de campanhas;
Preparar a conta;
Realizar emissões;
Iniciar outras etapas operacionais;

Depois que o investimento for realizado, o TITULAR compromete-se a colaborar com todas as etapas necessárias para conclusão da operação.

Essa colaboração poderá incluir:

Envio de códigos por SMS;
Confirmação por e-mail;
Resposta pelo WhatsApp;
Selfie;
Biometria facial;
Documento de identificação;
Comprovante de residência;
Ligação de confirmação;
Recuperação de acesso;
Auditorias;
Desbloqueio da conta;

A colaboração exigida nunca envolverá pagamento, PIX, transferência, depósito ou aporte financeiro por parte do TITULAR.

9. RECUSA APÓS O INVESTIMENTO

Antes de autorizar a utilização da conta, o TITULAR deverá ter certeza de que deseja participar e de que terá disponibilidade para colaborar com as validações necessárias.

Após a compra dos pontos, adesão a uma campanha ou realização de outro investimento pela Vias Aéreas, a recusa injustificada poderá gerar prejuízo financeiro direto à empresa.

Serão consideradas situações de não colaboração:

Recusa injustificada de biometria;
Recusa injustificada de envio de códigos;
Recusa injustificada de documentos;
Falta de resposta durante uma operação;
Abandono da operação;
Omissão após o investimento;
Atraso excessivo sem justificativa;
Fornecimento intencional de informações incorretas;

Nessas situações, a Vias Aéreas poderá:

Encerrar imediatamente a parceria;
Excluir definitivamente o cadastro;
Impedir futuras operações;
Impedir novas indicações;
Retirar a conta de campanhas futuras;
Priorizar outros titulares;

10. VALIDAÇÕES E DOCUMENTOS

A Livelo e a LATAM Pass poderão solicitar validações adicionais a qualquer momento.

Essas validações poderão incluir:

RG ou CNH;
Documento de identificação com foto;
Comprovante de residência;
Selfie;
Biometria facial;
Código por SMS;
Código por e-mail;
Confirmação por ligação;
Confirmação pelo aplicativo;
Questionário de segurança;
Auditoria cadastral;

O TITULAR compromete-se a fornecer informações verdadeiras e compatíveis com seus documentos.

A recusa, omissão ou demora injustificada poderá causar:

Bloqueio da conta;
Suspensão das operações;
Cancelamento de passagens;
Perda de campanhas;
Prejuízo financeiro à Vias Aéreas;
Encerramento da parceria;

11. COMUNICAÇÃO PELO WHATSAPP

O TITULAR deverá salvar na agenda do celular o número do colaborador da Vias Aéreas responsável pelo seu atendimento.

A Vias Aéreas poderá utilizar diferentes números de atendimento, conforme o colaborador responsável por cada titular.

O WhatsApp utilizado pelo TITULAR deverá possuir:

Nome de identificação;
Foto de perfil visível;
Número ativo para recebimento de mensagens;

Cadastros com WhatsApp sem foto de perfil não serão aceitos.

O TITULAR deverá acompanhar as mensagens durante as operações e responder com agilidade quando houver solicitação de código, selfie, biometria ou documento.

12. SCORE INTERNO

A Vias Aéreas poderá manter um score interno para organização e priorização das contas cadastradas.

O score poderá considerar:

Agilidade nas respostas;
Disponibilidade para biometria;
Envio rápido de códigos;
Colaboração com documentos;
Regularidade dos dados;
Histórico de operações;
Cumprimento das validações;
Ausência de recusas injustificadas;
Facilidade de comunicação;
Confiabilidade operacional;

Contas com melhor histórico poderão ser priorizadas em novas campanhas.

Contas com atrasos recorrentes, falta de resposta ou recusas injustificadas poderão deixar de receber novas oportunidades ou ser excluídas da parceria.

13. PROTEÇÃO E TRATAMENTO DOS DADOS

Os dados fornecidos pelo TITULAR poderão ser utilizados para:

Cadastro;
Comunicação;
Controle das operações;
Pagamentos;
Validações;
Organização interna;
Segurança;
Comprovação das autorizações;
Defesa de direitos relacionados às operações realizadas;

Os dados poderão incluir:

Nome completo;
CPF;
Data de nascimento;
Telefone;
E-mail;
Dados bancários para pagamento;
Informações operacionais das contas;
Documentos utilizados nas validações;
Histórico das operações autorizadas;

Os dados poderão ser armazenados em ambiente corporativo protegido, incluindo banco de dados interno, OneDrive corporativo ou ferramenta equivalente.

O TITULAR poderá solicitar a exclusão de seus dados, ciente de que isso poderá resultar:

No encerramento da parceria;
Na impossibilidade de novas operações;
Na exclusão do cadastro;
Na perda do histórico operacional;
Na impossibilidade de novas indicações;

Algumas informações poderão ser preservadas quando necessárias para cumprimento de obrigações legais, fiscais, contábeis ou para comprovação e defesa de direitos relacionados às operações já realizadas.

14. INDICAÇÃO DE NOVOS TITULARES

A Vias Aéreas poderá pagar ao TITULAR R$ 20,00 por indicação válida.

A indicação somente será considerada válida quando o novo titular:

Concluir o cadastro;
For aprovado pela Vias Aéreas;
Possuir conta apta;
Cumprir as validações solicitadas;
Estiver disponível para participar das operações;

A Vias Aéreas poderá aceitar, recusar ou suspender indicações conforme seus critérios internos de segurança e viabilidade operacional.

Caso o indicado descumpra este Termo, recuse validações ou apresente conduta incompatível com a parceria, o responsável pela indicação poderá ficar impedido de realizar novas indicações.

15. ENCERRAMENTO DA PARCERIA

Este Termo poderá ser encerrado por qualquer das partes.

Caso o TITULAR solicite o encerramento antes de qualquer investimento ou operação em andamento, a parceria poderá ser finalizada sem necessidade de novas validações.

Caso já exista compra de pontos, adesão a campanha, emissão ou outra operação iniciada, o TITULAR compromete-se a colaborar com as etapas necessárias para sua conclusão.

A Vias Aéreas poderá encerrar imediatamente a parceria em caso de:

Recusa injustificada de biometria;
Recusa de códigos ou documentos;
Não colaboração após investimento;
Informações falsas;
Utilização de dados de terceiros;
Falta de resposta;
Atrasos recorrentes;
Risco operacional;
Descumprimento deste Termo;

O encerramento poderá resultar na exclusão definitiva do cadastro e no impedimento de futuras operações.

16. AUSÊNCIA DE VÍNCULO EMPREGATÍCIO

Os valores recebidos pelo TITULAR possuem caráter eventual.

A participação nas operações não estabelece:

Vínculo empregatício;
Relação de subordinação;
Sociedade;
Representação comercial;
Salário;
Prestação de serviço contínua;
Garantia de pagamentos recorrentes;

Cabe ao TITULAR avaliar eventual obrigação tributária relacionada aos valores recebidos, conforme sua realidade fiscal e a legislação aplicável.

17. RISCOS OPERACIONAIS DAS PLATAFORMAS

O TITULAR declara estar ciente de que a Livelo e a LATAM Pass possuem regras próprias, políticas internas e mecanismos independentes de segurança.

As plataformas poderão determinar:

Bloqueio temporário;
Solicitação de documentos;
Suspensão da conta;
Exigência de biometria;
Alteração de regras;
Cancelamento de operações;
Indisponibilidade de sistemas;
Auditoria;
Confirmação por SMS;
Outras verificações de identidade;

Essas decisões são tomadas pelas próprias plataformas, e não pela Vias Aéreas.

O TITULAR compromete-se a colaborar com as medidas necessárias para regularização da conta e conclusão das operações autorizadas.

18. CIÊNCIA E AUTORIZAÇÃO

Ao aceitar eletronicamente este Termo no site da Vias Aéreas, o TITULAR declara que:

Leu integralmente o documento;
Compreendeu o funcionamento das operações;
Autoriza a utilização operacional das contas Livelo e LATAM Pass;
Compreendeu que a Vias Aéreas utilizará recursos próprios nas operações;
Compreendeu que não deverá realizar pagamentos ou investimentos;
Está ciente do pagamento de R$ 20,00 pela entrada da conta Livelo;
Está ciente de que a primeira biometria da Livelo está incluída nesse valor;
Está ciente do pagamento de R$ 80,00 por bloco operacional LATAM;
Compreendeu que o pagamento de R$ 80,00 abrange todas as emissões e biometrias do bloco;
Está ciente de que um bloco poderá envolver, em média, oito biometrias;
Compreendeu que a quantidade de biometrias poderá ser menor ou maior;
Está ciente de que não haverá pagamento separado por biometria ou emissão;
Possui telefone ativo para SMS e WhatsApp;
Possui nome e foto de perfil visíveis no WhatsApp;
Está disponível para acompanhar as validações;
Está ciente de que deverá colaborar após a realização dos investimentos;
Está ciente de que a recusa injustificada poderá gerar prejuízo e encerramento da parceria;
Declara que todas as informações fornecidas são verdadeiras;
Autoriza expressamente a realização das operações descritas neste documento;

O aceite eletrônico realizado no site registrará a concordância do TITULAR com todas as condições apresentadas neste Termo.`;

function highlightImportantTerms(text: string, keyPrefix: string) {
  return text.split(PALAVRAS_CHAVE_REGEX).map((part, index) => {
    if (PALAVRAS_CHAVE_LOOKUP.has(part.toLowerCase())) {
      return (
        <strong key={`${keyPrefix}-strong-${index}`} className="font-semibold text-slate-950">
          {part}
        </strong>
      );
    }

    return <span key={`${keyPrefix}-text-${index}`}>{part}</span>;
  });
}

function LegalTextBlock({ text, blockId }: { text: string; blockId: string }) {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let listItems: string[] = [];

  function flushList(groupIndex: number) {
    if (!listItems.length) return;

    nodes.push(
      <ul
        key={`${blockId}-list-${groupIndex}`}
        className="list-disc space-y-1 pl-5 text-slate-700"
      >
        {listItems.map((item, itemIndex) => (
          <li key={`${blockId}-list-${groupIndex}-${itemIndex}`}>
            {highlightImportantTerms(item, `${blockId}-list-${groupIndex}-${itemIndex}`)}
          </li>
        ))}
      </ul>
    );

    listItems = [];
  }

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (!line) {
      flushList(index);
      nodes.push(<div key={`${blockId}-space-${index}`} className="h-1.5" />);
      return;
    }

    const isMainTitle = index === 0;
    const isSubTitle = index === 1;
    const isSectionTitle = /^\d+\.\s/.test(line);
    const isLabel = line.endsWith(":");
    const isListItem = !isMainTitle && !isSubTitle && !isSectionTitle && !isLabel && /;$/.test(line);

    if (isListItem) {
      listItems.push(line.replace(/;$/, ""));
      return;
    }

    flushList(index);

    if (isMainTitle) {
      nodes.push(
        <p key={`${blockId}-title-${index}`} className="font-semibold text-slate-950">
          {highlightImportantTerms(line, `${blockId}-title-${index}`)}
        </p>
      );
      return;
    }

    if (isSubTitle) {
      nodes.push(
        <p key={`${blockId}-subtitle-${index}`} className="font-medium text-slate-700">
          {highlightImportantTerms(line, `${blockId}-subtitle-${index}`)}
        </p>
      );
      return;
    }

    if (isSectionTitle) {
      nodes.push(
        <p key={`${blockId}-section-${index}`} className="pt-2 font-semibold text-slate-950">
          {highlightImportantTerms(line, `${blockId}-section-${index}`)}
        </p>
      );
      return;
    }

    if (isLabel) {
      nodes.push(
        <p key={`${blockId}-label-${index}`} className="font-medium text-slate-900">
          {highlightImportantTerms(line, `${blockId}-label-${index}`)}
        </p>
      );
      return;
    }

    nodes.push(
      <p key={`${blockId}-line-${index}`} className="text-slate-700">
        {highlightImportantTerms(line, `${blockId}-line-${index}`)}
      </p>
    );
  });

  flushList(lines.length);

  return <div className="space-y-2 text-xs leading-relaxed">{nodes}</div>;
}

export default function ConviteClient({ code }: { code: string }) {
  const [form, setForm] = useState<FormState>({
    nomeCompleto: "",
    dataNascimento: "",
    cpf: "",

    // ✅ ADICIONADO
    telefone: "",

    codigoCedenteIndicacao: "",

    emailCriado: "",
    senhaEmail: "",
    senhaLatamPass: "",
    senhaLivelo: "",
    chavePix: "",
    banco: "",
    pixTipo: "",
    pontosLatam: "",
    pontosLivelo: "",
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
      codigoCedenteIndicacao: "",
      emailCriado: "",
      senhaEmail: "",
      senhaLatamPass: "",
      senhaLivelo: "",
      chavePix: "",
      banco: "",
      pixTipo: "",
      pontosLatam: "",
      pontosLivelo: "",
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
      codigoCedenteIndicacao: normalizeReferrerCodeInput(form.codigoCedenteIndicacao) || null,
      emailCriado: form.emailCriado.trim() || null,
      banco: form.banco.trim(),
      pixTipo: form.pixTipo,
      chavePix: form.chavePix.trim(),
      senhaEmailEnc: form.senhaEmail || null,
      senhaLatamPassEnc: form.senhaLatamPass || null,
      senhaLiveloEnc: form.senhaLivelo || null,
      pontosLatam: Number(form.pontosLatam || 0),
      pontosLivelo: Number(form.pontosLivelo || 0),
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

          <div className="rounded-xl border bg-slate-50 p-3 max-h-[360px] overflow-auto">
            <LegalTextBlock text={ORIENTACOES_TEXTO} blockId="orientacoes" />
          </div>
        </div>

        {/* ✅ TERMO + ACEITE */}
        <div className="mb-6 rounded-2xl border bg-white p-4 space-y-3">
          <div className="text-sm font-semibold">Termo de ciência e autorização</div>
          <div className="text-xs text-slate-500">Versão: {TERMO_VERSAO}</div>

          <div className="rounded-xl border bg-slate-50 p-3 max-h-[320px] overflow-auto">
            <LegalTextBlock text={TERMO_TEXTO} blockId="termo" />
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

              <div>
                <label className="mb-1 block text-sm">Código do cedente que te indicou</label>
                <input
                  className="w-full rounded-xl border px-3 py-2 font-mono uppercase"
                  value={form.codigoCedenteIndicacao}
                  onChange={(e) =>
                    setField("codigoCedenteIndicacao", normalizeReferrerCodeInput(e.target.value))
                  }
                  placeholder="Ex.: KLE-143 (opcional)"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Se alguém te indicou, informe o código exclusivo desse cedente.
                </p>
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
              <FieldNumber label="Livelo" value={form.pontosLivelo} onChange={(v) => setField("pontosLivelo", v)} />
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
                    <div><b>Livelo:</b> {duplicateInfo.existing.pontosLivelo}</div>
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
                    <FieldDiff label="Livelo" current={duplicateInfo.existing.pontosLivelo} next={Number(form.pontosLivelo || 0)} />
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
