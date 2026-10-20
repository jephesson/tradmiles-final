"use client";

import { MessageCircle } from "lucide-react";
import TelegramLoginForm from "@/components/vendas/TelegramLoginForm";

export default function TelegramPageClient() {
  return (
    <div className="mx-auto max-w-lg space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <MessageCircle className="h-5 w-5 text-slate-500" aria-hidden />
          Telegram
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Conecta a conta da empresa: digite o número, o Telegram manda o código no app, e
          fica logado para ler as emissões.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <TelegramLoginForm>
          <p className="text-sm text-emerald-800">
            Pronto. Na venda, use <b>Ler no Telegram</b> — não pede código de novo.
          </p>
        </TelegramLoginForm>
      </div>
    </div>
  );
}
