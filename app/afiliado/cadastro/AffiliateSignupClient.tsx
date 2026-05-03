"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type SignupResult = {
  affiliate: {
    id: string;
    name: string;
    login: string | null;
    status: string;
  };
};

function onlyDigits(value: string) {
  return (value || "").replace(/\D+/g, "");
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

const AFFILIATE_TERMS_TEXT = `TERMO DE ADESAO AO PROGRAMA DE AFILIADOS

VIAS AEREAS LTDA
CNPJ 63.817.773/0001-85

Pelo presente instrumento particular, de um lado, VIAS AEREAS LTDA, pessoa juridica de direito privado, inscrita no CNPJ sob o no 63.817.773/0001-85, doravante denominada CONTRATANTE, e, de outro lado, o(a) afiliado(a) identificado(a) no cadastro realizado em plataforma propria, doravante denominado(a) AFILIADO(A), tem entre si justo e acordado o presente Termo de Adesao ao Programa de Afiliados, mediante as clausulas e condicoes abaixo:

1. Objeto

1.1. O presente termo tem por objeto a participacao do(a) AFILIADO(A) no programa de indicacao comercial da CONTRATANTE, mediante divulgacao dos servicos de venda de passagens aereas e captacao de clientes interessados na venda de pontos de programas de fidelidade.

1.2. A atuacao do(a) AFILIADO(A) ocorrera por meio de materiais e ferramentas disponibilizados pela CONTRATANTE em ambiente digital proprio, incluindo, mas nao se limitando a:
a) QR Code exclusivo de identificacao;
b) folder promocional disponivel no site;
c) video promocional, que sera disponibilizado aos afiliados que optarem por utiliza-lo, por meio de link do YouTube nao listado e/ou em arquivo MP4 para download.

2. Prazo da parceria

2.1. A presente adesao tera prazo de 12 (doze) meses, contado da data de aceite eletronico ou confirmacao do cadastro do(a) AFILIADO(A) na plataforma da CONTRATANTE.

2.2. O prazo podera ser renovado por igual periodo, mediante manutencao da parceria entre as partes, conforme criterios da CONTRATANTE.

2.3. A vinculacao dos clientes indicados ao(aa) AFILIADO(A) tambem tera validade de 12 (doze) meses, contados da primeira identificacao valida da indicacao, podendo ser renovada nos termos definidos pela CONTRATANTE.

3. Comissao sobre venda de passagens

3.1. O(A) AFILIADO(A) fara jus ao recebimento de 20% (vinte por cento) sobre o lucro liquido apurado pela CONTRATANTE nas vendas de passagens aereas realizadas para clientes indicados e devidamente vinculados ao(aa) AFILIADO(A).

3.2. O lucro mencionado na clausula anterior sera calculado internamente pela CONTRATANTE, de acordo com seus criterios operacionais, comerciais e financeiros, considerando, entre outros fatores, os custos de compra, venda, emissao, taxas, despesas operacionais, custos administrativos e demais encargos relacionados a operacao.

3.3. O(A) AFILIADO(A) declara ciencia de que o valor do lucro podera variar conforme cada operacao realizada, nao havendo valor fixo previamente garantido por venda.

3.4. Para fins deste termo, considera-se conclusao do negocio a finalizacao da compra da passagem aerea pelo cliente indicado, com a confirmacao da operacao pela CONTRATANTE, apos o termino do periodo de cancelamento gratuito opcional, quando aplicavel.

4. Comissao sobre venda de pontos

4.1. Na hipotese de clientes indicados pelo(a) AFILIADO(A) realizarem venda de pontos para a CONTRATANTE, o(a) AFILIADO(A) recebera o valor de R$ 1,50 (um real e cinquenta centavos) para cada 1.000 (mil) pontos efetivamente vendidos a CONTRATANTE, nos seguintes programas:
a) Esfera;
b) Livelo;
c) C6;
d) Smiles;
e) LatamPass.

4.2. Para fins de exemplo, na venda de 100.000 (cem mil) pontos, o(a) AFILIADO(A) recebera o valor de R$ 150,00 (cento e cinquenta reais), desde que a operacao seja concluida com sucesso.

4.3. A comissao somente sera devida apos a efetiva conclusao da operacao de compra dos pontos pela CONTRATANTE.

5. Pagamento das comissoes

5.1. Os pagamentos das comissoes devidas ao(aa) AFILIADO(A) serao realizados em ate 48 (quarenta e oito) horas apos a conclusao do negocio.

5.2. O valor da comissao, bem como o respectivo status de pagamento, ficara disponivel para consulta em area restrita no site da CONTRATANTE, mediante login proprio do(a) AFILIADO(A).

5.3. O pagamento das comissoes observara a natureza cadastral do(a) AFILIADO(A), na forma deste termo.

6. Regras de indicacao e vinculacao do cliente

6.1. O cliente indicado pelo(a) AFILIADO(A) sera registrado no banco de dados da CONTRATANTE e permanecera vinculado ao respectivo afiliado pelo prazo de 12 (doze) meses, contado da primeira identificacao valida da indicacao, para fins de controle e pagamento das comissoes decorrentes das operacoes realizadas nesse periodo.

6.2. A indicacao somente sera considerada valida quando:
a) o cliente acessar a CONTRATANTE por meio do QR Code exclusivo do(a) AFILIADO(A); ou
b) o cliente informar, no momento da compra, o nome ou identificacao do(a) AFILIADO(A) responsavel pela indicacao.

6.3. O QR Code e unico e individual, sendo utilizado como mecanismo de rastreamento e identificacao das indicacoes vinculadas ao(aa) AFILIADO(A).

6.4. Nao serao considerados como clientes vinculados ao(aa) AFILIADO(A), para fins de pagamento de comissao, os clientes previamente cadastrados na plataforma ou ja existentes na base de dados da CONTRATANTE antes da indicacao.

6.5. Em caso de ausencia de identificacao por QR Code ou de informacao do nome do(a) AFILIADO(A) no momento da compra, a indicacao nao sera reconhecida para fins de comissao.

7. Disponibilizacao de materiais e acesso a plataforma

7.1. A CONTRATANTE disponibilizara ao(aa) AFILIADO(A), em area restrita do site:
a) QR Code exclusivo;
b) folder promocional;
c) informacoes sobre comissoes;
d) status dos pagamentos;
e) demais materiais de apoio que entender pertinentes.

7.2. O folder promocional ficara disponivel diretamente no site da CONTRATANTE.

7.3. O video promocional sera enviado ou disponibilizado aos afiliados que optarem por utiliza-lo, por meio de link do YouTube nao listado e/ou em arquivo MP4 para download, conforme conveniencia da CONTRATANTE.

7.4. A CONTRATANTE podera atualizar, substituir ou remover materiais promocionais sempre que entender necessario para adequacao comercial, tecnica ou institucional.

8. Afiliados pessoa fisica e pessoa juridica

8.1. O(A) AFILIADO(A) podera receber comissoes como pessoa fisica ate o limite de R$ 1.000,00 (mil reais) por mes.

8.2. Ultrapassado o valor de R$ 1.000,00 (mil reais) por mes, a continuidade dos pagamentos ficara condicionada a apresentacao de pessoa juridica regularmente constituida, apta a emissao de nota fiscal.

8.3. Para afiliados pessoa juridica, o pagamento sera realizado mediante emissao de nota fiscal, cabendo ao proprio afiliado a apuracao e o recolhimento dos tributos incidentes sobre sua receita, conforme seu enquadramento fiscal.

8.4. Para afiliados pessoa fisica, os pagamentos observarao a documentacao, cadastro e procedimentos administrativos e fiscais aplicaveis no momento do pagamento, conforme criterios da CONTRATANTE e da legislacao vigente.

8.5. A CONTRATANTE podera, a seu criterio, exigir a formalizacao por pessoa juridica sempre que houver recorrencia, volume operacional, necessidade fiscal, contabil ou administrativa que assim recomende.

9. Tratamento de dados pessoais - LGPD

9.1. As partes declaram ciencia de que o tratamento de dados pessoais eventualmente realizado no ambito desta parceria devera observar a legislacao aplicavel, em especial a Lei no 13.709/2018 (Lei Geral de Protecao de Dados Pessoais - LGPD).

9.2. A CONTRATANTE podera armazenar e tratar os dados dos clientes indicados e do(a) AFILIADO(A) para fins de:
a) identificacao da origem da indicacao;
b) controle de vinculo entre cliente e afiliado;
c) processamento de compras e vendas;
d) apuracao e pagamento de comissoes;
e) cumprimento de obrigacoes legais e regulatorias.

9.3. O(A) AFILIADO(A) compromete-se a utilizar eventuais dados a que tiver acesso apenas para finalidades legitimas relacionadas a divulgacao da parceria, abstendo-se de praticar qualquer uso indevido, compartilhamento nao autorizado ou tratamento em desconformidade com a LGPD.

9.4. A CONTRATANTE adotara medidas razoaveis de seguranca para protecao dos dados armazenados em seus sistemas, sem prejuizo das obrigacoes legais especificas aplicaveis.

10. Natureza da relacao

10.1. O presente termo nao gera vinculo empregaticio, societario, representacao comercial exclusiva, franquia, associacao, parceria societaria ou qualquer relacao de subordinacao entre as partes, limitando-se a adesao ao programa de afiliados da CONTRATANTE.

10.2. O(A) AFILIADO(A) atuara com autonomia, por sua conta e risco, na divulgacao dos servicos da CONTRATANTE.

11. Rescisao e encerramento da parceria

11.1. A presente parceria podera ser encerrada por qualquer das partes, a qualquer momento, mediante simples comunicacao, sem necessidade de justificativa e sem prejuizo para quaisquer das partes, permanecendo apenas devidos os valores de comissao relativos a negocios ja concluidos ate a data do encerramento.

11.2. O encerramento da parceria nao prejudicara o pagamento de comissoes ja adquiridas pelo(a) AFILIADO(A), desde que vinculadas a operacoes efetivamente concluidas na forma deste termo.

11.3. Encerrada a parceria, a CONTRATANTE podera desativar o acesso do(a) AFILIADO(A) a area restrita, ao QR Code exclusivo e aos materiais promocionais disponibilizados.

12. Disposicoes gerais

12.1. A adesao ao presente termo se dara por meio de aceite eletronico ou cadastro realizado pelo(a) AFILIADO(A) na plataforma da CONTRATANTE.

12.2. A CONTRATANTE podera alterar as condicoes deste programa, mediante atualizacao do termo em seu ambiente digital, passando a nova versao a valer a partir de sua disponibilizacao ao(aa) AFILIADO(A).

12.3. O(A) AFILIADO(A) declara ter lido, compreendido e aceito integralmente os termos aqui previstos.

E, por estarem de acordo, as partes aceitam o presente instrumento para todos os fins de direito.`;

export default function AffiliateSignupClient() {
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [bankName, setBankName] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SignupResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/afiliado/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          cpf: onlyDigits(cpf),
          pixKey,
          bankName,
          password,
          acceptedTerms,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Não foi possível enviar seu cadastro.");
        return;
      }
      setResult(json.data);
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <main className="min-h-screen bg-slate-50 grid place-items-center p-6">
        <div className="w-[min(460px,92vw)] rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Image
              src="/trademiles.png"
              alt="TradeMiles"
              width={38}
              height={38}
              priority
              unoptimized
              className="rounded-md"
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Cadastro enviado</h1>
              <p className="text-xs text-slate-500">Sua solicitação está em análise</p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
            <p>
              Recebemos seu cadastro, {result.affiliate.name}. Depois da aprovação,
              seu acesso será liberado no portal do afiliado.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Login gerado:{" "}
              <span className="font-medium text-slate-800">
                {result.affiliate.login || "em análise"}
              </span>
            </p>
          </div>

          <Link
            href="/afiliado/login"
            className="mt-5 block w-full rounded-xl bg-black px-4 py-2 text-center text-sm font-medium text-white"
          >
            Voltar para o login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 grid place-items-center p-6">
      <div className="w-[min(460px,92vw)]">
        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <Image
              src="/trademiles.png"
              alt="TradeMiles"
              width={38}
              height={38}
              priority
              unoptimized
              className="rounded-md"
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Cadastro de afiliado
              </h1>
              <p className="text-xs text-slate-500">TradeMiles parceiros</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-black/10"
              placeholder="Nome completo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />

            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-black/10"
              placeholder="CPF"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              inputMode="numeric"
              autoComplete="off"
            />

            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-black/10"
              placeholder="Chave Pix"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              autoComplete="off"
            />

            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-black/10"
              placeholder="Banco para recebimento (ex.: Itaú, Nubank)"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              autoComplete="off"
            />

            <div className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-black/10">
              <input
                className="flex-1 outline-none"
                placeholder="Senha"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                {showPwd ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            <div className="rounded-xl border bg-slate-50 p-3">
              <h2 className="text-sm font-semibold text-slate-900">
                Termo de Adesão ao Programa de Afiliados
              </h2>
              <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border bg-white p-3 text-[11px] leading-5 text-slate-700">
                <pre className="whitespace-pre-wrap font-sans">{AFFILIATE_TERMS_TEXT}</pre>
              </div>
              <label className="mt-3 flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  Li e aceito integralmente o Termo de Adesão ao Programa de Afiliados
                  da VIAS AÉREAS LTDA.
                </span>
              </label>
            </div>

            {error ? <p className="text-center text-xs text-rose-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading || !acceptedTerms}
              className="w-full rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "Enviando..." : "Enviar cadastro"}
            </button>

            <div className="text-center text-xs text-slate-600">
              Já tem acesso?{" "}
              <Link
                href="/afiliado/login"
                className="font-medium text-slate-950 underline-offset-4 hover:underline"
              >
                Entrar
              </Link>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
