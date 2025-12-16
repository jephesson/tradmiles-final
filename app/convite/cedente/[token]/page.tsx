export default async function ConvitePage({ params }: { params: { token: string } }) {
  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold mb-2">Convite do cedente</h1>
      <p className="text-sm text-slate-600 mb-6">
        Token: <b>{params.token}</b>
      </p>

      <div className="rounded-2xl border p-4 text-sm text-slate-700">
        Página de convite ainda em construção. (Agora o link já abre, e a API já valida o token.)
      </div>
    </div>
  );
}
