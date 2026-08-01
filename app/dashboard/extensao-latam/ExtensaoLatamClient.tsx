"use client";

import { Download, Puzzle } from "lucide-react";
import Link from "next/link";

const ZIP_HREF = "/downloads/trademiles-latam-extension.zip";

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

      <a
        href={ZIP_HREF}
        download
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
      >
        <Download className="h-4 w-4" aria-hidden />
        Baixar extensão (.zip)
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
