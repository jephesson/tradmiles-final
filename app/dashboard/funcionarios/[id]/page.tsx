import EditarFuncionarioClient from "./ui";

export default function Page({ params }: { params: { id: string } }) {
  return <EditarFuncionarioClient id={params.id} />;
}
