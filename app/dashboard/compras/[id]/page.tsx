import CompraClient from "./CompraClient";

export default function Page({ params }: { params: { id: string } }) {
  return <CompraClient purchaseId={params.id} />;
}
