export const dynamic = "force-dynamic";

import CedentesVisualizarClient from "./CedentesVisualizarClient";
import CedentesVisualizarLatamClient from "./CedentesVisualizarLatamClient";

export default function Page({
  searchParams,
}: {
  searchParams?: { programa?: string };
}) {
  const p = (searchParams?.programa || "").toLowerCase();

  if (p === "latam") return <CedentesVisualizarLatamClient />;

  return <CedentesVisualizarClient />;
}
