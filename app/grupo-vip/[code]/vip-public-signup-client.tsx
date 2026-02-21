"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type PublicInfoResponse = {
  ok?: boolean;
  error?: string;
  data?: {
    code: string;
    employee: { id: string; name: string; login: string };
    pricing: { firstMonthCents: number; recurringMonthCents: number };
    pix: { key: string; label: string };
  };
};

type RegisterResponse = {
  ok?: boolean;
  error?: string;
  data?: {
    lead: { id: string; status: string; createdAt: string; fullName: string };
    employee: { id: string; name: string; login: string };
    employeeWhatsappUrl: string;
    employeeWhatsappMessage: string;
    pix: { key: string; label: string };
    pricing: { firstMonthCents: number; recurringMonthCents: number };
  };
};

type FormState = {
  fullName: string;
  birthDate: string;
  countryCode: string;
  areaCode: string;
  phoneNumber: string;
  originAirport: string;
  destinationAirport1: string;
  destinationAirport2: string;
  destinationAirport3: string;
};

const COUNTRY_OPTIONS = [
  { value: "55", label: "Brasil (+55)" },
  { value: "1", label: "Estados Unidos (+1)" },
  { value: "351", label: "Portugal (+351)" },
  { value: "34", label: "Espanha (+34)" },
  { value: "54", label: "Argentina (+54)" },
  { value: "598", label: "Uruguai (+598)" },
];

const DDD_OPTIONS = [
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
];

const AIRPORT_OPTIONS = [
  { code: "GRU", label: "GRU - São Paulo (Guarulhos)" },
  { code: "CGH", label: "CGH - São Paulo (Congonhas)" },
  { code: "VCP", label: "VCP - Campinas (Viracopos)" },
  { code: "GIG", label: "GIG - Rio de Janeiro (Galeão)" },
  { code: "SDU", label: "SDU - Rio de Janeiro (Santos Dumont)" },
  { code: "BSB", label: "BSB - Brasília" },
  { code: "CNF", label: "CNF - Belo Horizonte (Confins)" },
  { code: "SSA", label: "SSA - Salvador" },
  { code: "REC", label: "REC - Recife" },
  { code: "FOR", label: "FOR - Fortaleza" },
  { code: "POA", label: "POA - Porto Alegre" },
  { code: "CWB", label: "CWB - Curitiba" },
  { code: "FLN", label: "FLN - Florianópolis" },
  { code: "MAO", label: "MAO - Manaus" },
  { code: "BEL", label: "BEL - Belém" },
  { code: "NAT", label: "NAT - Natal" },
  { code: "MCZ", label: "MCZ - Maceió" },
  { code: "JPA", label: "JPA - João Pessoa" },
  { code: "AJU", label: "AJU - Aracaju" },
  { code: "CGB", label: "CGB - Cuiabá" },
  { code: "GYN", label: "GYN - Goiânia" },
  { code: "LIS", label: "LIS - Lisboa" },
  { code: "MIA", label: "MIA - Miami" },
  { code: "MAD", label: "MAD - Madrid" },
  { code: "SCL", label: "SCL - Santiago" },
];

function digitsOnly(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function formatMoney(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function VipPublicSignupClient({ code }: { code: string }) {
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [info, setInfo] = useState<PublicInfoResponse["data"] | null>(null);

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [employeeWhatsappUrl, setEmployeeWhatsappUrl] = useState<string | null>(
    null
  );

  const [form, setForm] = useState<FormState>({
    fullName: "",
    birthDate: "",
    countryCode: "55",
    areaCode: "",
    phoneNumber: "",
    originAirport: "",
    destinationAirport1: "",
    destinationAirport2: "",
    destinationAirport3: "",
  });

  useEffect(() => {
    let active = true;

    (async () => {
      setLoadingInfo(true);
      setInfoError(null);
      try {
        const res = await fetch(`/api/grupo-vip/public/${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as PublicInfoResponse;
        if (!res.ok || !data.ok || !data.data) {
          throw new Error(data.error || "Link inválido ou inativo.");
        }
        if (!active) return;
        setInfo(data.data);
      } catch (e) {
        if (!active) return;
        setInfo(null);
        setInfoError(errorMessage(e, "Erro ao carregar link do funcionário."));
      } finally {
        if (active) setLoadingInfo(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [code]);

  const destinations = useMemo(
    () => [
      form.destinationAirport1,
      form.destinationAirport2,
      form.destinationAirport3,
    ],
    [form.destinationAirport1, form.destinationAirport2, form.destinationAirport3]
  );

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSuccessMessage(null);
    setEmployeeWhatsappUrl(null);

    if (!form.fullName.trim()) {
      alert("Informe seu nome completo.");
      return;
    }
    if (!form.birthDate) {
      alert("Informe sua data de nascimento.");
      return;
    }
    if (!form.countryCode) {
      alert("Selecione o código do país.");
      return;
    }
    if (!digitsOnly(form.areaCode)) {
      alert("Selecione/informe o DDD.");
      return;
    }
    if (digitsOnly(form.phoneNumber).length < 8) {
      alert("Informe um número de WhatsApp válido.");
      return;
    }
    if (!form.originAirport) {
      alert("Selecione o aeroporto de origem.");
      return;
    }
    if (destinations.some((d) => !d)) {
      alert("Selecione os 3 aeroportos de destino.");
      return;
    }
    if (new Set(destinations).size < destinations.length) {
      alert("Os 3 destinos devem ser diferentes.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        birthDate: form.birthDate,
        countryCode: digitsOnly(form.countryCode),
        areaCode: digitsOnly(form.areaCode),
        phoneNumber: digitsOnly(form.phoneNumber),
        originAirport: form.originAirport,
        destinationAirport1: form.destinationAirport1,
        destinationAirport2: form.destinationAirport2,
        destinationAirport3: form.destinationAirport3,
      };

      const res = await fetch(`/api/grupo-vip/public/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as RegisterResponse;

      if (!res.ok || !data.ok || !data.data) {
        throw new Error(data.error || "Erro ao enviar cadastro.");
      }

      setSuccessMessage(
        "Cadastro recebido com sucesso. Agora finalize o atendimento no WhatsApp do responsável."
      );
      setEmployeeWhatsappUrl(data.data.employeeWhatsappUrl || null);

      if (data.data.employeeWhatsappUrl) {
        window.open(data.data.employeeWhatsappUrl, "_blank", "noopener,noreferrer");
      }

      setForm({
        fullName: "",
        birthDate: "",
        countryCode: "55",
        areaCode: "",
        phoneNumber: "",
        originAirport: "",
        destinationAirport1: "",
        destinationAirport2: "",
        destinationAirport3: "",
      });
    } catch (e) {
      alert(errorMessage(e, "Erro ao enviar cadastro."));
    } finally {
      setSaving(false);
    }
  }

  if (loadingInfo) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-white">
        <div className="rounded-2xl border border-white/20 bg-white/10 px-6 py-4 text-sm">
          Carregando...
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 px-4">
        <div className="w-full max-w-xl rounded-3xl border border-red-300 bg-white p-8">
          <h1 className="text-2xl font-bold text-slate-900">Link inválido</h1>
          <p className="mt-2 text-slate-600">
            {infoError || "Esse link não está ativo no momento."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#93c5fd_0,_#0b4fbf_45%,_#052a6c_100%)] py-10 px-4">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <section className="rounded-3xl border border-sky-200/60 bg-white/95 p-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-slate-900">
            OFERTAS DE PASSAGENS
          </div>
          <h1 className="mt-3 text-3xl font-black text-sky-900">
            Grupo VIP WhatsApp • Vias Aéreas
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Cadastro pelo link de <strong>{info.employee.name}</strong> (@
            {info.employee.login})
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <div className="text-xs uppercase tracking-wide text-sky-700">
                1º mês
              </div>
              <div className="mt-1 text-2xl font-extrabold text-sky-900">
                {formatMoney(info.pricing.firstMonthCents)}
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs uppercase tracking-wide text-emerald-700">
                A partir do 2º mês
              </div>
              <div className="mt-1 text-2xl font-extrabold text-emerald-900">
                {formatMoney(info.pricing.recurringMonthCents)}
              </div>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <div className="text-xs uppercase tracking-wide text-violet-700">
                Pagamento
              </div>
              <div className="mt-1 text-sm font-bold text-violet-900">
                PIX: {info.pix.key}
              </div>
              <div className="text-xs text-violet-700">{info.pix.label}</div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/40 bg-white p-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
          <h2 className="text-xl font-bold text-slate-900">Faça seu cadastro</h2>
          <p className="mt-1 text-sm text-slate-500">
            Preencha os dados para receber os alertas de passagens.
          </p>

          {successMessage && (
            <div className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <p>{successMessage}</p>
              {employeeWhatsappUrl && (
                <a
                  href={employeeWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Abrir WhatsApp do responsável
                </a>
              )}
            </div>
          )}

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Nome completo
                </span>
                <input
                  value={form.fullName}
                  onChange={(e) => setField("fullName", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  placeholder="Seu nome"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Data de nascimento
                </span>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(e) => setField("birthDate", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Código do país
                </span>
                <select
                  value={form.countryCode}
                  onChange={(e) => setField("countryCode", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                >
                  {COUNTRY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  DDD
                </span>
                <select
                  value={form.areaCode}
                  onChange={(e) => setField("areaCode", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  required
                >
                  <option value="">Selecione</option>
                  {DDD_OPTIONS.map((ddd) => (
                    <option key={ddd} value={ddd}>
                      {ddd}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Número WhatsApp
                </span>
                <input
                  value={form.phoneNumber}
                  onChange={(e) => setField("phoneNumber", digitsOnly(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  placeholder="999999999"
                  maxLength={12}
                  required
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Aeroporto de origem
                </span>
                <select
                  value={form.originAirport}
                  onChange={(e) => setField("originAirport", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  required
                >
                  <option value="">Selecione</option>
                  {AIRPORT_OPTIONS.map((airport) => (
                    <option key={airport.code} value={airport.code}>
                      {airport.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Destino 1
                </span>
                <select
                  value={form.destinationAirport1}
                  onChange={(e) => setField("destinationAirport1", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  required
                >
                  <option value="">Selecione</option>
                  {AIRPORT_OPTIONS.map((airport) => (
                    <option key={`d1-${airport.code}`} value={airport.code}>
                      {airport.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Destino 2
                </span>
                <select
                  value={form.destinationAirport2}
                  onChange={(e) => setField("destinationAirport2", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  required
                >
                  <option value="">Selecione</option>
                  {AIRPORT_OPTIONS.map((airport) => (
                    <option key={`d2-${airport.code}`} value={airport.code}>
                      {airport.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Destino 3
                </span>
                <select
                  value={form.destinationAirport3}
                  onChange={(e) => setField("destinationAirport3", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none ring-0 focus:border-sky-500"
                  required
                >
                  <option value="">Selecione</option>
                  {AIRPORT_OPTIONS.map((airport) => (
                    <option key={`d3-${airport.code}`} value={airport.code}>
                      {airport.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Enviando..." : "Cadastrar e abrir WhatsApp"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
