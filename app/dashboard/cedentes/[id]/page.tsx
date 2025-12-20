export const dynamic = "force-dynamic";

import CedenteDetalheClient from "./CedenteDetalheClient";

export default function Page({ params }: { params: { id: string } }) {
  return <CedenteDetalheClient id={params.id} />;
}
