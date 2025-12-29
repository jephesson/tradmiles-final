import PainelEmissoesClient from "./PainelEmissoesClient";

export const dynamic = "force-dynamic";

export default function Page({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const programaRaw = searchParams?.programa;
  const programa = Array.isArray(programaRaw) ? programaRaw[0] : programaRaw;

  return (
    <div className="p-6">
      <PainelEmissoesClient initialProgram={(programa || "latam").toLowerCase()} />
    </div>
  );
}
