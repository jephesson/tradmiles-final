import { redirect } from "next/navigation";
import CedentesVisualizarClient from "./CedentesVisualizarClient";

export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams?: { programa?: string };
}) {
  const p = (searchParams?.programa || "").toLowerCase();

  // Se vier ?programa=latam, manda pra rota dedicada
  if (p === "latam") {
    redirect("/dashboard/cedentes/visualizar/latam");
  }

  // Default: Todos
  return <CedentesVisualizarClient />;
}
