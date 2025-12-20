"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Cedente = {
  id: string;
  identificador: string;
  nomeCompleto: string;
  cpf: string;
  telefone: string | null;
  dataNascimento: string | null;
  emailCriado: string | null;

  banco: string | null;
  pixTipo: string | null;
  chavePix: string | null;

  senhaEmailEnc: string | null;
  senhaSmilesEnc: string | null;
  senhaLatamPassEnc: string | null;
  senhaLiveloEnc: string | null;
  senhaEsferaEnc: string | null;

  pontosLatam: number;
  pontosSmiles: number;
  pontosLivelo: number;
  pontosEsfera: number;

  owner?: { id: string; name: string; login: string } | null;
};

function CopyRow({ label, value }: { label: string; value?: string | null }) {
  const v = value ?? "";
  return (
    <div className="rounded-xl border p-3 flex items-center justify-between gap-3">
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className="font-medium break-all">{v || "-"}</div>
      </div>
      <button
        type="button"
        className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50"
        onClick={() => navigator.clipboard.writeText(v)}
        disabled={!v}
        title={!v ? "Sem valor" : "Copiar"}
      >
        Copiar
      </button>
    </div>
  );
}

export default function CedenteDetalheClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [data, setData] = useState<Cedente | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/cedentes/${id}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!json?.ok) throw new Error(json?.error || "Falha ao carregar cedente.");
        setData(json.data as Cedente);
      } catch (e: any) {
        alert(e?.message || "Erro ao carregar.");
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-slate-600">Carregando…</div>;
  if (!data) return <div className="p-6 text-sm text-slate-600">Cedente não encontrado.</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data.nomeCompleto}</h1>
          <p className="text-sm text-slate-600">
            {data.identificador} • CPF: {data.cpf}
            {data.owner ? ` • Responsável: ${data.owner.name} (@${data.owner.login})` : ""}
          </p>
        </div>

        <button
          type="button"
          className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
          onClick={() => router.back()}
        >
          Voltar
        </button>
      </div>

      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="font-semibold">Dados</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CopyRow label="Telefone" value={data.telefone} />
          <CopyRow label="E-mail criado" value={data.emailCriado} />
          <CopyRow label="Banco" value={data.banco} />
          <CopyRow label="PIX tipo" value={data.pixTipo} />
          <CopyRow label="Chave PIX" value={data.chavePix} />
        </div>
      </section>

      <section className="rounded-2xl border p-4 space-y-3">
        <h2 className="font-semibold">Senhas (pronto pra copiar)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <CopyRow label="Senha do e-mail" value={data.senhaEmailEnc} />
          <CopyRow label="Senha Smiles" value={data.senhaSmilesEnc} />
          <CopyRow label="Senha Latam Pass" value={data.senhaLatamPassEnc} />
          <CopyRow label="Senha Livelo" value={data.senhaLiveloEnc} />
          <CopyRow label="Senha Esfera" value={data.senhaEsferaEnc} />
        </div>
      </section>
    </div>
  );
}
