import CompraDetalheClient from "./CompraDetalheClient";

export default function Page({ params }: { params: { id: string } }) {
  return <CompraDetalheClient purchaseId={params.id} />;
}
