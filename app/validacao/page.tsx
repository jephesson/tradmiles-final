import type { Metadata } from "next";
import ValidacaoClient from "./ValidacaoClient";

export const metadata: Metadata = {
  title: {
    absolute: "Validação · Vias Aéreas",
  },
  description: "Converte o link da reserva LATAM em pagamento e o link da Unico em biometria.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ValidacaoClient />;
}
