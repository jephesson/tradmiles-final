"use client";

import { Download, Puzzle } from "lucide-react";
import Link from "next/link";

const ZIP_HREF = "/downloads/trademiles-latam-extension.zip";
const EXTENSION_VERSION = "0.2.54";
const EXTENSION_UPDATED_AT = "01/08/2026";

export default function ExtensaoLatamClient() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Puzzle className="h-5 w-5 text-slate-500" aria-hidden />
          Extensão LATAM
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Preenche passageiros e cartão na LATAM com dados do TradeMiles
          (funcionário logado). CVV não é salvo — digite na hora do pagamento.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-semibold text-slate-900">
            Versão {EXTENSION_VERSION}
          </span>
          <span className="text-slate-500">
            Última alteração: {EXTENSION_UPDATED_AT}
          </span>
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
          <li>
            Formulário <b>v2</b> otimizado (LATAM <code className="rounded bg-slate-100 px-1">/v2/passageiros</code>)
            — acordeão, CPF, data, sexo e contato.
          </li>
          <li>
            Formulário <b>v1</b> (pagamentos/passageiros) ainda sem testes efetivos.
          </li>
          <li>Cartão de crédito no pagamento: funcionando sem erros.</li>
        </ul>
      </div>

      <a
        href={ZIP_HREF}
        download
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
      >
        <Download className="h-4 w-4" aria-hidden />
        Baixar extensão v{EXTENSION_VERSION} (.zip)
      </a>

      <ol className="list-decimal space-y-2 rounded-2xl border border-slate-200 bg-white p-4 pl-8 text-sm text-slate-700 shadow-sm">
        <li>
          Baixe o ZIP e <b>descompacte</b> em uma pasta.
        </li>
        <li>
          Abra <code className="rounded bg-slate-100 px-1">chrome://extensions</code>
        </li>
        <li>Ative o <b>Modo do desenvolvedor</b>.</li>
        <li>
          <b>Carregar sem compactação</b> → selecione a pasta descompactada.
        </li>
        <li>
          Faça login em{" "}
          <code className="rounded bg-slate-100 px-1">www.trademiles.com.br</code>{" "}
          no mesmo Chrome.
        </li>
        <li>
          Na venda, no passo <b>Extensão LATAM</b>: cole os passageiros, confira o
          cartão e clique em <b>Preparar extensão</b>.
        </li>
        <li>
          Na LATAM, use o botão <b>Preencher TradeMiles</b> (canto inferior
          direito) se não preencher sozinho.
        </li>
      </ol>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Cadastre cartões em{" "}
        <Link
          href="/dashboard/funcionarios/dados-pagamento"
          className="font-semibold text-sky-700 underline"
        >
          Dados de pagamento
        </Link>
        . O cartão padrão de taxa já vem selecionado na venda.
      </div>
    </div>
  );
}
