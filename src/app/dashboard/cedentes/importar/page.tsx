import CedentesImporter from "@/components/CedentesImporter";

export const metadata = {
  title: "Importar cedentes • TradeMiles",
  description: "Importe planilhas, gere IDs, aplique pontos e responsáveis.",
};

export default function Page() {
  return (
    <div className="w-full">
      <CedentesImporter />
    </div>
  );
}
