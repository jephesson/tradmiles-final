"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Cedente = {
  id: string;
  status: string;
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

  owner: { id: string; name: string; login: string } | null;
};

function fmtInt(n: number) {
  try {
    return new Intl.NumberFormat("pt-BR").format(n || 0);
  } catch {
    return String(n || 0);
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function CedenteDetalheClient({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<Cedente | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
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
  }

  useEffect(() => {
    load();
  }, [id]);

  const blocoCopiar = useMemo(() => {
    if (!data) return "";

    const lines: string[] = [];
    lines.push(`NOME: ${data.nomeCompleto}`);
    lines.push(`CPF: ${data.cpf}`);
    if (data.telefone) lines.push(`TELEFONE: ${data.telefone}`);
    if (data.dataNascimento) lines.push(`NASCIMENTO: ${data.dataNascimento}`);

    lines.push("");
    lines.push("=== ACESSOS ===");
    if (data.emailCriado) lines.push(`EMAIL: ${data.emailCriado}`);
    if (data.senhaEmailEnc) lines.push(`SENHA EMAIL: ${data.senhaEmailEnc}`);
    if (data.senhaLatamPassEnc) lines.push(`SENHA LATAM PASS: ${data.senhaLatamPassEnc}`);
    if (data.senhaSmilesEnc) lines.push(`SENHA SMILES: ${data.senhaSmilesEnc}`);
    if (data.senhaLiveloEnc) lines.push(`SENHA LIVELO: ${data.senhaLiveloEnc}`);
    if (data.senhaEsferaEnc) lines.push(`SENHA ESFERA: ${data.senhaEsferaEnc}`);

    lines.push("");
    lines.push("=== PIX ===");
    if (data.banco) lines.push(`BANCO: ${data.banco}`);
    if (data.pixTipo) lines.push(`TIPO CHAVE: ${data.pixTipo}`);
    if (data.chavePix) lines.push(`CHAVE PIX: ${data.chavePix}`);

    lines.push("");
    lines.push("=== PONTOS ===");
    lines.push(`LATAM: ${fmtInt(data.pontosLatam)}`);
    lines.push(`SMILES: ${fmtInt(data.pontosSmiles)}`);
    lines.push(`LIVELO: ${fmtInt(data.pontosLivelo)}`);
    lines.push(`ESFERA: ${fmtInt(data.pontosEsfera)}`);

    if (data.owner) {
      lines.push("");
      lines.push(`RESPONSÁVEL: ${data.owner.name} (@${data.owner.login})`);
    }

    return lines.join("\n");
  }, [data]);

  if (loading) return <div className="p-6 text-sm text-slate-600">Carregando…</div>;
  if (!data) return <div className="p-6 text-sm text-slate-600">Não encontrado.</div>;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data.nomeCompleto}</h1>
          <p className="text-sm text-slate-600">
            {data.identificador} • Status: <b>{data.status}</b>
            {data.owner ? (
              <>
                {" "}
                • Responsável: <b>{data.owner.name}</b> (@{data.owner.login})
              </>
            ) : null}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            type="button"
            onClick={() => router.back()}
          >
            Voltar
          </button>
          <button
            className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-slate-900"
            type="button"
            onClick={async () => {
              const ok = await copy(blocoCopiar);
              alert(ok ? "Copiado ✅" : "Não consegui copiar (permite clipboard no navegador).");
            }}
          >
            Copiar tudo
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Dados pessoais">
          <KV label="Nome" value={data.nomeCompleto} />
          <KV label="CPF" value={data.cpf} />
          <KV label="Telefone" value={data.telefone || "-"} />
          <KV label="Nascimento" value={data.dataNascimento || "-"} />
        </Card>

        <Card title="PIX">
          <KV label="Banco" value={data.banco || "-"} />
          <KV label="Tipo" value={data.pixTipo || "-"} />
          <KV label="Chave" value={data.chavePix || "-"} />
          <RowCopy label="Copiar chave PIX" value={data.chavePix || ""} />
        </Card>

        <Card title="Acessos">
          <KV label="Email" value={data.emailCriado || "-"} />
          <RowCopy label="Copiar email" value={data.emailCriado || ""} />
          <Hr />
          <Secret label="Senha e-mail" value={data.senhaEmailEnc} />
          <Secret label="Senha Latam Pass" value={data.senhaLatamPassEnc} />
          <Secret label="Senha Smiles" value={data.senhaSmilesEnc} />
          <Secret label="Senha Livelo" value={data.senhaLiveloEnc} />
          <Secret label="Senha Esfera" value={data.senhaEsferaEnc} />
        </Card>

        <Card title="Pontos">
          <KV label="Latam" value={fmtInt(data.pontosLatam)} />
          <KV label="Smiles" value={fmtInt(data.pontosSmiles)} />
          <KV label="Livelo" value={fmtInt(data.pontosLivelo)} />
          <KV label="Esfera" value={fmtInt(data.pontosEsfera)} />
        </Card>
      </div>

      <div className="rounded-2xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold">Texto pronto para copiar</div>
          <button
            className="rounded-xl border px-3 py-1.5 text-xs hover:bg-slate-50"
            type="button"
            onClick={async () => {
              const ok = await copy(blocoCopiar);
              alert(ok ? "Copiado ✅" : "Não consegui copiar.");
            }}
          >
            Copiar
          </button>
        </div>
        <textarea
          className="w-full rounded-xl border p-3 text-xs leading-5"
          rows={14}
          readOnly
          value={blocoCopiar}
        />
      </div>

      <div className="rounded-2xl border p-4 text-xs text-slate-600">
        ⚠️ Aqui aparecem senhas em texto (do jeito que você decidiu). Deixa essa página só pra usuários logados.
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border p-4">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium text-right break-words">{value}</div>
    </div>
  );
}

function Hr() {
  return <div className="my-2 h-px w-full bg-slate-200" />;
}

function Secret({ label, value }: { label: string; value: string | null }) {
  const v = value || "";
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="flex items-center gap-2">
        <div className="text-sm font-medium tabular-nums">{v ? "••••••••" : "-"}</div>
        <button
          className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
          disabled={!v}
          type="button"
          onClick={async () => {
            const ok = await copy(v);
            alert(ok ? "Copiado ✅" : "Não consegui copiar.");
          }}
        >
          Copiar
        </button>
      </div>
    </div>
  );
}

function RowCopy({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-end">
      <button
        className="rounded-lg border px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
        disabled={!value}
        type="button"
        onClick={async () => {
          const ok = await copy(value);
          alert(ok ? "Copiado ✅" : "Não consegui copiar.");
        }}
      >
        {label}
      </button>
    </div>
  );
}
