import CadastroEmissorClient from "./CadastroEmissorClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Cadastro de emissor · Vias Aéreas" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CadastroEmissorClient token={token} />;
}
