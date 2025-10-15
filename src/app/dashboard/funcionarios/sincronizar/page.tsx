// src/app/dashboard/funcionarios/sincronizar/page.tsx
"use client";

import ResponsavelImporter from "@/components/ResponsavelImporter";

export default function Page() {
  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-semibold">Sincronizar responsáveis com cedentes</h1>
      <p className="mb-4 text-sm text-slate-600">
        Carregue o Excel com as colunas de <b>Cedente</b> e <b>Responsável</b>, aplique
        a correspondência e salve para atualizar os cedentes existentes.
      </p>
      <ResponsavelImporter />
    </div>
  );
}
