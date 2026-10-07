"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type PixDestinoView = {
  nome: string;
  cpf: string | null;
  banco: string | null;
  pixTipo: string;
  pixKey: string;
  source: string;
  cpfMatchesKey: boolean | null;
};

const PIX_TIPOS = ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"] as const;

function fmtMoneyBR(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PixDestinoConfirmModal(props: {
  title: string;
  amountCents: number;
  destino: PixDestinoView;
  busy?: boolean;
  editable?: boolean;
  needsPix?: boolean;
  pixError?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onSavePix?: (pixTipo: string, pixKey: string) => Promise<void>;
}) {
  const { destino } = props;
  const [pixTipo, setPixTipo] = useState(destino.pixTipo || "CPF");
  const [pixKey, setPixKey] = useState(destino.pixKey || "");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    setPixTipo(destino.pixTipo || "CPF");
    setPixKey(destino.pixKey || "");
    setSaveErr("");
  }, [destino.pixTipo, destino.pixKey]);

  const dirty =
    String(pixTipo).toUpperCase() !== String(destino.pixTipo || "").toUpperCase() ||
    String(pixKey).trim() !== String(destino.pixKey || "").trim();

  async function savePix() {
    if (!props.onSavePix) return;
    setSaving(true);
    setSaveErr("");
    try {
      await props.onSavePix(pixTipo, pixKey.trim());
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Não deu para gravar a chave.");
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function confirm() {
    try {
      if (props.editable && props.onSavePix && (dirty || props.needsPix)) {
        await savePix();
      }
      props.onConfirm();
    } catch {
      /* erro já aparece no modal */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {props.editable
                ? "Cadastre ou ajuste a chave. Ao gravar, ela fica no cadastro do cedente."
                : "Confira o destinatário cadastrado. O Inter só valida a chave na hora do PIX."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-50"
            onClick={props.onCancel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Valor</dt>
            <dd className="font-semibold tabular-nums text-slate-900">{fmtMoneyBR(props.amountCents)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Nome</dt>
            <dd className="text-right font-medium text-slate-900">{destino.nome}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">CPF</dt>
            <dd className="tabular-nums text-slate-900">{destino.cpf || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Banco no cadastro</dt>
            <dd className="text-right text-slate-900">{destino.banco || "—"}</dd>
          </div>
          {props.editable ? (
            <>
              <div>
                <dt className="text-slate-500">Tipo da chave</dt>
                <select
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  value={pixTipo}
                  onChange={(e) => setPixTipo(e.target.value)}
                >
                  {PIX_TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <dt className="text-slate-500">Chave PIX</dt>
                <input
                  className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="Informe a chave"
                />
                <button
                  type="button"
                  className="mt-2 h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  disabled={saving || props.busy || !pixKey.trim()}
                  onClick={() => void savePix().catch(() => undefined)}
                >
                  {saving ? "Gravando..." : "Gravar chave"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Tipo da chave</dt>
                <dd className="font-medium text-slate-900">{destino.pixTipo}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Chave PIX</dt>
                <dd className="mt-1 break-all rounded-xl bg-slate-50 px-3 py-2 font-mono text-[13px] text-slate-900">
                  {destino.pixKey}
                </dd>
              </div>
            </>
          )}
          <p className="text-xs text-slate-400">Origem: {destino.source}</p>
        </dl>

        {props.needsPix || props.pixError ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {props.pixError || "Cadastre a chave PIX para enviar."}
          </div>
        ) : null}

        {saveErr ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {saveErr}
          </div>
        ) : null}

        {destino.cpfMatchesKey === false ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            A chave CPF não é o mesmo documento do cadastro. Confira antes de enviar.
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={props.onCancel}
            disabled={props.busy || saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="h-10 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            onClick={() => void confirm()}
            disabled={props.busy || saving || (props.editable && !pixKey.trim())}
          >
            {props.busy ? "Enviando..." : "Confirmar PIX"}
          </button>
        </div>
      </div>
    </div>
  );
}
