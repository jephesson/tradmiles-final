export const dynamic = "force-dynamic";

import CedentesVisualizarClient from "./CedentesVisualizarClient";
import CedentesVisualizarLatamClient from "./CedentesVisualizarLatamClient";

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const programaRaw = Array.isArray(sp.programa) ? sp.programa[0] : sp.programa;
  const p = (programaRaw || "").toLowerCase();

  if (p === "latam") {
    return <CedentesVisualizarLatamClient />;
  }

  return <CedentesVisualizarClient />;
}
