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
          Uso interno. Preenche passageiros e cartão na LATAM com dados do
          TradeMiles (funcionário logado). CVV não é salvo.
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
          Baixe o ZIP e <b>descompacte</b> em uma pasta (ex.: Desktop).
        </li>
        <li>
          Abra <code className="rounded bg-slate-100 px-1">chrome://extensions</code>
        </li>
        <li>Ative o <b>Modo do desenvolvedor</b> (canto superior direito).</li>
        <li>
          Clique em <b>Carregar sem compactação</b> e selecione a pasta
          descompactada.
        </li>
        <li>Faça login no TradeMiles neste mesmo Chrome.</li>
        <li>
          Na venda LATAM, depois do link de pesquisa, marque{" "}
          <b>Usar extensão LATAM</b>, cole os passageiros e clique em{" "}
          <b>Preparar extensão</b>.
        </li>
        <li>
          Abra a página da LATAM — a extensão preenche se estiver ligada.
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
        . Deixe a extensão <b>desligada</b> na venda se não for usar.
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <b>Não precisa</b> fechar o Chrome nem deslogar. Faça assim:
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Baixe o ZIP de novo (versão 0.1.7+).</li>
          <li>
            Em <code className="rounded bg-white/80 px-1">chrome://extensions</code>{" "}
            remova a extensão antiga → <b>Carregar sem compactação</b> na pasta
            nova.
          </li>
          <li>
            Na LATAM (F5): deve aparecer o botão preto{" "}
            <b>Preencher TradeMiles</b> no canto inferior direito — clique nele.
          </li>
        </ol>
        TradeMiles e LATAM na <b>mesma</b> janela (não anônimo separado).
      </div>
    </div>
  );
}
