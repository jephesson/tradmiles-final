"use client";

import { Download, Puzzle } from "lucide-react";
import Link from "next/link";

const ZIP_HREF = "/downloads/trademiles-latam-extension.zip?v=0.2.59";
const ZIP_SAFARI_HREF = "/downloads/trademiles-latam-safari.zip?v=0.2.59";
const EXTENSION_VERSION = "0.2.59";
const EXTENSION_UPDATED_AT = "14/09/2026";

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
          Chrome e Safari são pacotes diferentes; os dois podem ficar instalados.
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
            Formulário <b>v2</b> otimizado (LATAM{" "}
            <code className="rounded bg-slate-100 px-1">/v2/passageiros</code>)
            — acordeão, CPF, data, sexo e contato.
          </li>
          <li>
            Criança e bebê: o <b>Nº de documento</b> recebe o mesmo CPF (LATAM exige os dois).
          </li>
          <li>Cartão de crédito no pagamento: funcionando sem erros.</li>
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href={ZIP_HREF}
          download
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Download className="h-4 w-4" aria-hidden />
          Chrome v{EXTENSION_VERSION}
        </a>
        <a
          href={ZIP_SAFARI_HREF}
          download
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" aria-hidden />
          Safari v{EXTENSION_VERSION}
        </a>
      </div>

      <ol className="list-decimal space-y-2 rounded-2xl border border-slate-200 bg-white p-4 pl-8 text-sm text-slate-700 shadow-sm">
        <li>
          Baixe o ZIP do <b>Chrome</b> e <b>descompacte</b> em uma pasta.
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

      <ol className="list-decimal space-y-2 rounded-2xl border border-sky-100 bg-sky-50 p-4 pl-8 text-sm text-slate-700 shadow-sm">
        <li>
          Baixe o ZIP do <b>Safari</b> (pacote próprio, nome{" "}
          <b>TradeMiles LATAM Safari</b>) e descompacte.
        </li>
        <li>
          Instale o <b>Xcode</b> na App Store (grátis) e abra uma vez para aceitar
          a licença. O Safari não instala ZIP como o Chrome.
        </li>
        <li>
          No Terminal, dentro da pasta descompactada:{" "}
          <code className="rounded bg-white px-1">chmod +x convert.sh && ./convert.sh</code>
        </li>
        <li>
          No Xcode, clique em <b>▶ Run</b>. Depois: Safari → <b>Ajustes</b> →{" "}
          <b>Extensões</b> → ligue <b>TradeMiles LATAM Safari</b>.
        </li>
        <li>
          Se pedir: Safari → Ajustes → Avançado → mostrar menu Desenvolver →{" "}
          <b>Permitir extensões não assinadas</b>. Autorize acesso ao TradeMiles e à
          LATAM.
        </li>
        <li>
          Login em{" "}
          <code className="rounded bg-white px-1">www.trademiles.com.br</code>{" "}
          <b>no Safari</b> (a sessão do Chrome não vale). Preparar extensão na
          venda e abrir a LATAM no Safari.
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
