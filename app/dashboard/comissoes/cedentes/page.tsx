import { Suspense } from "react";
import CedenteCommissionsClient from "./CedenteCommissionsClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Carregando comissões…</div>}>
      <CedenteCommissionsClient />
    </Suspense>
  );
}
