import Compra from "./cliente";

export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  return <Compra id={params.id} />;
}
