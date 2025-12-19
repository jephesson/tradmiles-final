import FuncionarioEditClient from "./FuncionarioEditClient";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // ✅ Next 16
  return <FuncionarioEditClient id={id} />;
}
