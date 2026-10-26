import ParceirosClient from "./ParceirosClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Parceiros | TradeMiles",
  description: "Estoque LATAM e atendentes online para parceiros da Vias Aéreas.",
};

export default function ParceirosPage() {
  return <ParceirosClient />;
}
