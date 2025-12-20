import CedentesImporter from "@/components/CedentesImporter";

export const metadata = {
  title: "Importar cedentes • TradeMiles",
};

export default function ImportarCedentesPage() {
  return (
    <div className="p-6">
      <CedentesImporter />
    </div>
  );
}
