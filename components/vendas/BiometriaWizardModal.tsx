"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
  SkipForward,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { getSession } from "@/lib/auth";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { EmailNaoSincronizadoAviso } from "@/components/cedentes/EmailNaoSincronizadoAviso";
import {
  isValidCpf,
  parsePassengerText,
  passengerParseNeedsAi,
} from "@/lib/latam/parsePassengerText";
import { OTP_LOOKBACK_MS } from "@/lib/gmail/otp";
import { OtpCountdown } from "@/components/cedentes/OtpCountdown";

type Program = "LATAM" | "SMILES";

type WhatsAppContact = {
  telefone: string | null;
  whatsappE164: string | null;
  whatsappUrl: string | null;
} | null;

type Creds = {
  cpf?: string | null;
  email?: string | null;
  programEmail?: string | null;
  senhaPrograma?: string | null;
  programPassword?: string | null;
  senhaEmail?: string | null;
  emailPassword?: string | null;
  emailRedirecionado?: boolean | null;
} | null;

type Step = "creds" | "code" | "search" | "extension" | "order";
type TripKind = "IDA" | "IDA_VOLTA";

/** Link curto para a mensagem do cedente. */
const LATAM_SITE_URL = "https://www.latamairlines.com/br/pt";
/** Tela de login — só para o atendente abrir/copiar. */
const LATAM_LOGIN_URL =
  "https://auth.latamairlines.com/u/login/identifier?state=hKFo2SBKT1dOMEF1ZXhiZkViU3hjNWJMOHVkTkFuMDFwOVljQ6Fur3VuaXZlcnNhbC1sb2dpbqN0aWTZIEpCSDM5WlBHb25VLUZVTzVKOFlkRXhySWdOVEFNRDcyo2NpZNkgUDVOSzdzam44MlNiamNaNHMyWmwzWTRhNXd2MmFzQkk&ui_locales=pt";
const SMILES_SITE_URL = "https://www.smiles.com.br";

/** Titular virtual no seletor de cartão — taxas da empresa, não do funcionário. */
const VIAS_OWNER_ID = "__vias_aereas__";

function formatArrivedAt(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toIata(raw: string) {
  return String(raw || "")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
    .slice(0, 3);
}

/** Link de ofertas LATAM em milhas (redemption=true). */
function buildLatamSearchLink(params: {
  origin: string;
  destination: string;
  outbound: string;
  inbound?: string;
  trip: "OW" | "RT";
  adt: number;
  chd?: number;
  inf?: number;
}): string | null {
  const origin = toIata(params.origin);
  const destination = toIata(params.destination);
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.outbound)) return null;
  if (params.trip === "RT" && !/^\d{4}-\d{2}-\d{2}$/.test(params.inbound || "")) {
    return null;
  }

  const q = new URLSearchParams();
  q.set("origin", origin);
  q.set("destination", destination);
  q.set("outbound", `${params.outbound}T12:00:00.000Z`);
  if (params.trip === "RT" && params.inbound) {
    q.set("inbound", `${params.inbound}T12:00:00.000Z`);
  }
  q.set("adt", String(Math.max(1, Math.floor(params.adt) || 1)));
  q.set("chd", String(Math.max(0, Math.floor(params.chd || 0))));
  q.set("inf", String(Math.max(0, Math.floor(params.inf || 0))));
  q.set("trip", params.trip);
  q.set("cabin", "Economy");
  q.set("redemption", "true");
  q.set("sort", "RECOMMENDED");
  return `https://www.latamairlines.com/br/pt/oferta-voos?${q.toString()}`;
}

function extractLatamOrderId(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const url = new URL(s);
    const fromParam = url.searchParams.get("orderId") || url.searchParams.get("orderid");
    if (fromParam && /^LA[A-Z0-9]+$/i.test(fromParam.trim())) {
      return fromParam.trim().toUpperCase();
    }
  } catch {
    // fall through
  }
  const fromQuery = s.match(/orderId=([A-Za-z0-9]+)/i);
  if (fromQuery?.[1] && /^LA[A-Z0-9]+$/i.test(fromQuery[1])) {
    return fromQuery[1].toUpperCase();
  }
  const cleaned = s.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (/^LA[A-Z0-9]+$/.test(cleaned)) return cleaned;
  return null;
}

function buildLatamPagamentoLink(orderId: string) {
  return `https://www.latamairlines.com/br/pt/v2/pagamentos/?orderId=${encodeURIComponent(
    orderId
  )}&flow=BOOKING-REDEMPTION`;
}

const UNICO_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUnicoHost(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "cadastro.unico.app" ||
    host === "id.unico.io" ||
    /(?:^|\.)unico\.(app|io)$/.test(host)
  );
}

function unicoProcessLinkFromId(id: string) {
  return `https://cadastro.unico.app/process/${id}?collect-data=true`;
}

/**
 * Qualquer link Unico com ?id=uuid → process.
 * Aceita id.unico.io/flow, cadastro.unico.app/flow/intro, /process/{id}, ou UUID puro.
 */
function normalizeUnicoBiometriaLink(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;

  if (UNICO_UUID_RE.test(s)) return unicoProcessLinkFromId(s);

  try {
    const url = new URL(s);
    if (!isUnicoHost(url.hostname)) {
      const id = String(url.searchParams.get("id") || "").trim();
      if (UNICO_UUID_RE.test(id)) return unicoProcessLinkFromId(id);
      return null;
    }

    const processMatch = url.pathname.match(
      /^\/process\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i
    );
    if (processMatch?.[1]) return unicoProcessLinkFromId(processMatch[1]);

    const id = String(url.searchParams.get("id") || "").trim();
    if (UNICO_UUID_RE.test(id)) return unicoProcessLinkFromId(id);
  } catch {
    const idMatch = s.match(
      /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    );
    if (idMatch?.[1] && UNICO_UUID_RE.test(idMatch[1])) {
      return unicoProcessLinkFromId(idMatch[1]);
    }
  }
  return null;
}

function buildWhatsAppUrlFromContact(contact: WhatsAppContact, message: string) {
  if (!contact || !message.trim()) return null;
  if (contact.whatsappE164) return buildWhatsAppLink(contact.whatsappE164, message);
  const base = contact.whatsappUrl;
  if (!base) return null;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}text=${encodeURIComponent(message)}`;
}

/** Link na mensagem WhatsApp (curto, amigável). */
function siteUrl(program: Program) {
  return program === "SMILES" ? SMILES_SITE_URL : LATAM_SITE_URL;
}

/** Link que o atendente abre/copia (login direto na LATAM). */
function openSiteUrl(program: Program) {
  return program === "SMILES" ? SMILES_SITE_URL : LATAM_LOGIN_URL;
}

function programLabel(program: Program) {
  return program === "SMILES" ? "Smiles" : "LATAM";
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    prompt("Copie:", value);
    return false;
  }
}

function fmtPts(n: number) {
  return (n || 0).toLocaleString("pt-BR");
}

type Props = {
  open: boolean;
  program: Program;
  cedenteId: string;
  cedenteNome: string;
  /** Saldo cadastrado no momento da sugestão. */
  accountPoints?: number;
  /** Pontos desta emissão (ida + volta). */
  salePoints?: number;
  creds: Creds;
  loadingCreds: boolean;
  credsError: string;
  whatsapp: WhatsAppContact;
  whatsappPhoneLabel?: string;
  /** Pré-preenche trecho/PAX da tela de venda. */
  initialTripKind?: TripKind;
  initialAdults?: number;
  initialChildren?: number;
  /** Bebê: entra no link LATAM, não consome CPF do cedente. */
  initialInfants?: number;
  onClose: () => void;
  onComplete: (result: {
    purchaseCode: string | null;
    pagamentoLink: string | null;
    searchLink: string | null;
    departureDate: string | null;
    returnDate: string | null;
    skippedOrder: boolean;
    /** Cartão da taxa na venda: SELF | VIAS | USER:id */
    feeCardPreset?: string | null;
  }) => void;
};

export default function BiometriaWizardModal({
  open,
  program,
  cedenteId,
  cedenteNome,
  accountPoints = 0,
  salePoints = 0,
  creds,
  loadingCreds,
  credsError,
  whatsapp,
  whatsappPhoneLabel,
  initialTripKind = "IDA",
  initialAdults = 1,
  initialChildren = 0,
  initialInfants = 0,
  onClose,
  onComplete,
}: Props) {
  const [step, setStep] = useState<Step>("creds");
  const [codeWatchAfter, setCodeWatchAfter] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState<string | null>(null);
  const [otpMeta, setOtpMeta] = useState<{ subject: string; date: string | null } | null>(
    null
  );
  const [otpSynced, setOtpSynced] = useState(true);
  const [otpReason, setOtpReason] = useState<string | null>(null);
  const [orderLinkInput, setOrderLinkInput] = useState("");
  const [bioLinkInput, setBioLinkInput] = useState("");

  const [searchTrip, setSearchTrip] = useState<TripKind>("IDA");
  const [searchOrigin, setSearchOrigin] = useState("");
  const [searchDestination, setSearchDestination] = useState("");
  const [searchOutbound, setSearchOutbound] = useState("");
  const [searchInbound, setSearchInbound] = useState("");
  const [searchAdt, setSearchAdt] = useState(1);
  const [searchChd, setSearchChd] = useState(0);
  const [searchInf, setSearchInf] = useState(0);

  /** Extensão LATAM — passo após o link de pesquisa. */
  const [useLatamExtension, setUseLatamExtension] = useState(true);
  const [latamPassengerText, setLatamPassengerText] = useState("");
  const [docExtracting, setDocExtracting] = useState(false);
  const [docExtractError, setDocExtractError] = useState("");
  const [docExtractWarnings, setDocExtractWarnings] = useState<string[]>([]);
  const [latamPaymentCards, setLatamPaymentCards] = useState<
    Array<{
      id: string;
      label: string;
      last4: string;
      email?: string | null;
      isDefaultBoarding: boolean;
      isCompany: boolean;
      userId: string | null;
    }>
  >([]);
  const [latamPaymentCardId, setLatamPaymentCardId] = useState("");
  const [latamCardOwnerId, setLatamCardOwnerId] = useState("");
  const [latamEmployees, setLatamEmployees] = useState<
    Array<{ id: string; name: string; login: string }>
  >([]);
  const [latamExtSyncing, setLatamExtSyncing] = useState(false);
  const [latamExtMsg, setLatamExtMsg] = useState<string | null>(null);
  /** Contato do titular (cartão/funcionário) — fallback se o texto não tiver e-mail/tel. */
  const [latamTitularContact, setLatamTitularContact] = useState<{
    email: string | null;
    phone: string | null;
  }>({ email: null, phone: null });
  const [latamAiPassengers, setLatamAiPassengers] = useState<
    ReturnType<typeof parsePassengerText> | null
  >(null);
  const [latamParseSource, setLatamParseSource] = useState<"regex" | "openai">(
    "regex"
  );
  const [latamAiParsing, setLatamAiParsing] = useState(false);
  const [liveAccountPoints, setLiveAccountPoints] = useState<number | null>(null);

  const expectedPassengerCount = Math.max(
    0,
    searchAdt + searchChd + searchInf
  );

  const latamRegexPassengers = useMemo(
    () =>
      useLatamExtension
        ? parsePassengerText(latamPassengerText, latamTitularContact)
        : [],
    [useLatamExtension, latamPassengerText, latamTitularContact]
  );

  const latamParsedPassengers = latamAiPassengers ?? latamRegexPassengers;
  const latamMissingBirth = latamParsedPassengers.filter((p) => !p.birthDate);

  // Regex primeiro; se ficar incompleto, tenta OpenAI (não quebra se falhar).
  useEffect(() => {
    if (!useLatamExtension || !latamPassengerText.trim()) {
      setLatamAiPassengers(null);
      setLatamParseSource("regex");
      setLatamAiParsing(false);
      return;
    }
    if (
      !passengerParseNeedsAi(
        latamRegexPassengers,
        expectedPassengerCount,
        latamPassengerText
      )
    ) {
      setLatamAiPassengers(null);
      setLatamParseSource("regex");
      setLatamAiParsing(false);
      return;
    }

    let cancelled = false;
    setLatamAiParsing(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/latam-extension/parse-passengers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: latamPassengerText,
            expectedCount: expectedPassengerCount,
            titular: latamTitularContact,
          }),
        });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.ok && Array.isArray(json.passengers)) {
          setLatamAiPassengers(json.passengers);
          setLatamParseSource(json.source === "openai" ? "openai" : "regex");
        } else {
          setLatamAiPassengers(null);
          setLatamParseSource("regex");
        }
      } catch {
        if (!cancelled) {
          setLatamAiPassengers(null);
          setLatamParseSource("regex");
        }
      } finally {
        if (!cancelled) setLatamAiParsing(false);
      }
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [
    useLatamExtension,
    latamPassengerText,
    expectedPassengerCount,
    latamRegexPassengers.length,
    latamTitularContact,
  ]);

  const cpf = creds?.cpf || "";
  const email = creds?.programEmail || creds?.email || "";
  const programPass = creds?.programPassword || creds?.senhaPrograma || "";
  const emailPass = creds?.emailPassword || creds?.senhaEmail || "";

  const extractedOrderId = useMemo(
    () => (program === "LATAM" ? extractLatamOrderId(orderLinkInput) : null),
    [orderLinkInput, program]
  );
  const pagamentoLink = useMemo(
    () => (extractedOrderId ? buildLatamPagamentoLink(extractedOrderId) : null),
    [extractedOrderId]
  );
  const bioLinkNormalized = useMemo(
    () => (program === "LATAM" ? normalizeUnicoBiometriaLink(bioLinkInput) : null),
    [bioLinkInput, program]
  );
  const bioSendMessage = useMemo(() => {
    if (!bioLinkNormalized) return "";
    const nome = cedenteNome?.trim();
    return [
      nome ? `Olá, ${nome}! Tudo bem?` : "Olá, tudo bem?",
      "",
      "Segue o link da biometria:",
      bioLinkNormalized,
    ].join("\n");
  }, [bioLinkNormalized, cedenteNome]);
  const bioWaUrl = useMemo(
    () => buildWhatsAppUrlFromContact(whatsapp, bioSendMessage),
    [whatsapp, bioSendMessage]
  );

  const searchLink = useMemo(
    () =>
      buildLatamSearchLink({
        origin: searchOrigin,
        destination: searchDestination,
        outbound: searchOutbound,
        inbound: searchInbound,
        trip: searchTrip === "IDA_VOLTA" ? "RT" : "OW",
        adt: searchAdt,
        chd: searchChd,
        inf: searchInf,
      }),
    [
      searchOrigin,
      searchDestination,
      searchOutbound,
      searchInbound,
      searchTrip,
      searchAdt,
      searchChd,
      searchInf,
    ]
  );

  const loginMessage = useMemo(() => {
    const site = siteUrl(program);
    const label = programLabel(program);
    return [
      cedenteNome ? `Olá, ${cedenteNome}! Tudo bem?` : "Olá, tudo bem?",
      "",
      `Preciso que você acesse o site da ${label}, faça login com seus dados e me envie o código que chegar no e-mail:`,
      "",
      `Site: ${site}`,
      "",
      `Login (CPF): ${cpf.trim() || "—"}`,
      `Senha ${label}: ${programPass.trim() || "—"}`,
    ].join("\n");
  }, [cedenteNome, program, cpf, programPass]);

  const loginWaUrl = useMemo(
    () => buildWhatsAppUrlFromContact(whatsapp, loginMessage),
    [whatsapp, loginMessage]
  );

  const manualEmailMessage = useMemo(() => {
    return [
      cedenteNome ? `Olá, ${cedenteNome}! Tudo bem?` : "Olá, tudo bem?",
      "",
      "Preciso que você entre no e-mail e me envie o código de verificação que acabou de chegar.",
      "",
      `E-mail: ${email.trim() || "—"}`,
      `Senha do e-mail: ${emailPass.trim() || "—"}`,
    ].join("\n");
  }, [cedenteNome, email, emailPass]);

  const manualEmailWaUrl = useMemo(
    () => buildWhatsAppUrlFromContact(whatsapp, manualEmailMessage),
    [whatsapp, manualEmailMessage]
  );

  useEffect(() => {
    if (!open) return;
    setStep("creds");
    setCodeWatchAfter(null);
    setManualMode(false);
    setOtpCode(null);
    setOtpMeta(null);
    setOtpError(null);
    setOtpSynced(true);
    setOtpReason(null);
    setOrderLinkInput("");
    setBioLinkInput("");
    setSearchTrip(initialTripKind);
    setSearchOrigin("");
    setSearchDestination("");
    setSearchOutbound("");
    setSearchInbound("");
    setSearchAdt(Math.max(1, Math.min(9, Math.floor(initialAdults) || 1)));
    setSearchChd(Math.max(0, Math.min(9, Math.floor(initialChildren) || 0)));
    setSearchInf(Math.max(0, Math.min(9, Math.floor(initialInfants) || 0)));
    setUseLatamExtension(true);
    setLatamPassengerText("");
    setDocExtracting(false);
    setDocExtractError("");
    setDocExtractWarnings([]);
    setLatamPaymentCardId("");
    setLatamExtMsg(null);
  }, [
    open,
    cedenteId,
    program,
    initialTripKind,
    initialAdults,
    initialChildren,
    initialInfants,
  ]);

  const fetchOtp = useCallback(async () => {
    if (!cedenteId) return;
    setOtpLoading(true);
    setOtpError(null);
    try {
      const params = new URLSearchParams({
        cedenteId,
        program,
      });
      if (codeWatchAfter) params.set("after", codeWatchAfter);

      const res = await fetch(`/api/emails/verification-code?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Falha ao buscar código.");

      setOtpSynced(Boolean(json.synced));
      setOtpReason(json.reason || null);

      if (!json.synced) {
        setManualMode(true);
        setOtpCode(null);
        setOtpMeta(null);
        return;
      }

      if (json.latest?.code) {
        setOtpCode(String(json.latest.code));
        setOtpMeta({
          subject: String(json.latest.subject || ""),
          date: json.latest.date || null,
        });
      } else {
        setOtpCode(null);
        setOtpMeta(null);
      }
    } catch (e) {
      setOtpError(e instanceof Error ? e.message : "Falha ao buscar código.");
    } finally {
      setOtpLoading(false);
    }
  }, [cedenteId, program, codeWatchAfter]);

  function markCodeWatch(atMs = Date.now()) {
    const iso = new Date(atMs).toISOString();
    setCodeWatchAfter((prev) => {
      if (!prev) return iso;
      // Mantém o marco mais cedo (WhatsApp / abrir site antes do Seguir).
      return new Date(prev).getTime() <= atMs ? prev : iso;
    });
  }

  function startCodeStep() {
    // Se ainda não marcou (WhatsApp/site), olha 3 min atrás — código já pedido na cia.
    const lookbackMs = Date.now() - OTP_LOOKBACK_MS;
    setCodeWatchAfter((prev) => {
      if (!prev) return new Date(lookbackMs).toISOString();
      return new Date(prev).getTime() <= lookbackMs
        ? prev
        : new Date(lookbackMs).toISOString();
    });
    setStep("code");
    setManualMode(!email);
  }

  useEffect(() => {
    if (!open || step !== "code" || manualMode || !codeWatchAfter) return;
    void fetchOtp();
  }, [open, step, manualMode, codeWatchAfter, fetchOtp]);

  function resolveFeeCardPreset(): string | null {
    const selected = latamPaymentCards.find((c) => c.id === latamPaymentCardId);
    if (!latamPaymentCardId || !selected) return null;
    if (selected.isCompany || latamCardOwnerId === VIAS_OWNER_ID) return "VIAS";
    const me = getSession()?.id || "";
    if (latamCardOwnerId && latamCardOwnerId === me) return "SELF";
    if (latamCardOwnerId && latamCardOwnerId !== VIAS_OWNER_ID) {
      return `USER:${latamCardOwnerId}`;
    }
    return "SELF";
  }

  function finish(opts: { purchaseCode: string | null; skippedOrder: boolean }) {
    onComplete({
      purchaseCode: opts.purchaseCode,
      pagamentoLink:
        opts.purchaseCode && program === "LATAM"
          ? buildLatamPagamentoLink(opts.purchaseCode)
          : null,
      searchLink: program === "LATAM" ? searchLink : null,
      departureDate: searchOutbound || null,
      returnDate:
        searchTrip === "IDA_VOLTA" && searchInbound ? searchInbound : null,
      skippedOrder: opts.skippedOrder,
      feeCardPreset: resolveFeeCardPreset(),
    });
  }

  function goAfterCode() {
    if (program === "LATAM") setStep("search");
    else finish({ purchaseCode: null, skippedOrder: true });
  }

  async function loadLatamPaymentCards(ownerId?: string) {
    try {
      const me = getSession()?.id || "";
      const rawOwner = ownerId || latamCardOwnerId || me;
      const viasMode = rawOwner === VIAS_OWNER_ID;
      // API: cartões do user + empresa; para Vias pedimos o do logado (inclui company)
      const uid = viasMode ? me : rawOwner;
      if (!latamCardOwnerId && me) setLatamCardOwnerId(me);
      const qs = uid ? `?userId=${encodeURIComponent(uid)}` : "";
      const res = await fetch(`/api/funcionarios/payment-cards${qs}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return;
      const list = Array.isArray(json.data) ? json.data : [];
      setLatamPaymentCards(list);
      setLatamPaymentCardId((prev) => {
        if (prev && list.some((c: { id: string }) => c.id === prev)) {
          // Se mudou para Vias, força cartão empresa se o atual não for
          if (viasMode) {
            const cur = list.find((c: { id: string }) => c.id === prev);
            if (cur?.isCompany) return prev;
            return (
              list.find((c: { isCompany: boolean }) => c.isCompany)?.id || prev
            );
          }
          return prev;
        }
        if (viasMode) {
          return (
            list.find((c: { isCompany: boolean }) => c.isCompany)?.id ||
            list[0]?.id ||
            ""
          );
        }
        const def = list.find(
          (c: {
            isDefaultBoarding: boolean;
            isCompany: boolean;
            userId: string | null;
          }) => c.isDefaultBoarding && !c.isCompany && (!uid || c.userId === uid)
        );
        return (
          def?.id ||
          list.find((c: { isCompany: boolean }) => !c.isCompany)?.id ||
          list[0]?.id ||
          ""
        );
      });
    } catch {
      /* ignore */
    }
  }

  async function loadLatamEmployeesForCards() {
    try {
      const res = await fetch("/api/funcionarios", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return;
      const list = (Array.isArray(json.data) ? json.data : [])
        .filter((u: { isActive?: boolean }) => u.isActive !== false)
        .map((u: { id: string; name: string; login: string }) => ({
          id: u.id,
          name: u.name,
          login: u.login,
        }));
      setLatamEmployees(list);
      const me = getSession()?.id || "";
      if (me) setLatamCardOwnerId((prev) => prev || me);
    } catch {
      /* ignore */
    }
  }

  /** E-mail/tel do titular do cartão (ou do funcionário dono) para fallback nos pax. */
  async function loadLatamTitularContact() {
    try {
      const card = latamPaymentCards.find((c) => c.id === latamPaymentCardId);
      const me = getSession()?.id || "";
      const rawOwner = latamCardOwnerId || card?.userId || me;
      const hintUserId =
        rawOwner === VIAS_OWNER_ID ? me : rawOwner || me;
      const qs = hintUserId
        ? `?userId=${encodeURIComponent(hintUserId)}`
        : "";
      const res = await fetch(
        `/api/funcionarios/payment-cards/titular-hint${qs}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      const hint = json?.ok ? json.data : null;
      setLatamTitularContact({
        email:
          (card?.email || "").trim() ||
          (hint?.email || "").trim() ||
          null,
        phone: (hint?.phone || "").trim() || null,
      });
    } catch {
      setLatamTitularContact({ email: null, phone: null });
    }
  }

  async function extractDocumentsFromFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setDocExtracting(true);
    setDocExtractError("");
    setDocExtractWarnings([]);
    try {
      const fd = new FormData();
      Array.from(fileList)
        .slice(0, 8)
        .forEach((f) => fd.append("files", f));
      fd.append("existingText", latamPassengerText);
      const res = await fetch("/api/documents/extract", {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao ler documentos.");
      }
      const merged = String(json.mergedText || json.passengerText || "");
      setLatamPassengerText(merged);
      setDocExtractWarnings(
        Array.isArray(json.warnings) ? json.warnings.map(String) : []
      );
      if (!json.passengers?.length) {
        setDocExtractError(
          "Nenhum passageiro reconhecido — confira a foto ou cole o texto."
        );
      }
    } catch (e: any) {
      setDocExtractError(e?.message || "Falha ao ler documentos.");
    } finally {
      setDocExtracting(false);
    }
  }

  async function syncLatamExtensionSession(nextUse?: boolean) {
    const on = typeof nextUse === "boolean" ? nextUse : useLatamExtension;
    setLatamExtSyncing(true);
    setLatamExtMsg(null);
    if (on && latamParsedPassengers.some((p) => !p.birthDate)) {
      setLatamExtMsg(
        "Data de nascimento é obrigatória em todos os passageiros."
      );
      setLatamExtSyncing(false);
      return;
    }
    try {
      const res = await fetch("/api/latam-extension/fill-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useExtension: on,
          passengerText: latamPassengerText,
          passengers: latamParsedPassengers,
          expectedCount: expectedPassengerCount,
          paymentCardId: latamPaymentCardId || null,
          saleHint: extractedOrderId || searchLink || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Falha ao sincronizar extensão.");
      }
      const n = json.data?.passengers?.length ?? 0;
      const badCpf = latamParsedPassengers.filter(
        (p) => p.cpf && (p.cpfValid === false || !isValidCpf(p.cpf))
      ).length;
      setLatamExtMsg(
        on
          ? badCpf
            ? `Extensão pronta · ${n} passageiro(s), mas ${badCpf} CPF incorreto — confira antes de emitir.`
            : `Extensão pronta · ${n} passageiro(s)${
                latamParseSource === "openai" ? " (IA)" : ""
              }. Abra a LATAM com a extensão.`
          : "Extensão desligada nesta venda."
      );
    } catch (e) {
      setLatamExtMsg(e instanceof Error ? e.message : "Erro ao sincronizar.");
    } finally {
      setLatamExtSyncing(false);
    }
  }

  // Ao entrar no passo: carrega cartões e pré-seleciona o padrão de taxa
  useEffect(() => {
    if (!open || step !== "extension") return;
    void loadLatamEmployeesForCards();
    void loadLatamPaymentCards();
  }, [open, step]);

  // Cartão empresa → titular Vias Aéreas (taxa da empresa, não do funcionário)
  useEffect(() => {
    if (!latamPaymentCardId) return;
    const card = latamPaymentCards.find((c) => c.id === latamPaymentCardId);
    if (card?.isCompany && latamCardOwnerId !== VIAS_OWNER_ID) {
      setLatamCardOwnerId(VIAS_OWNER_ID);
    }
  }, [latamPaymentCardId, latamPaymentCards, latamCardOwnerId]);

  // Contato do titular para fallback de e-mail/tel nos passageiros
  useEffect(() => {
    if (!open || step !== "extension" || !useLatamExtension) return;
    void loadLatamTitularContact();
  }, [
    open,
    step,
    useLatamExtension,
    latamPaymentCardId,
    latamCardOwnerId,
    latamPaymentCards,
  ]);

  useEffect(() => {
    if (!open || !cedenteId) {
      setLiveAccountPoints(null);
      return;
    }

    let cancelled = false;

    async function loadPoints() {
      try {
        const res = await fetch(
          `/api/cedentes/${encodeURIComponent(cedenteId)}/pontos?program=${encodeURIComponent(
            program
          )}`,
          { cache: "no-store" }
        );
        const j = await res.json().catch(() => null);
        if (cancelled || !j?.ok || typeof j.points !== "number") return;
        setLiveAccountPoints(Math.max(0, Math.trunc(j.points)));
      } catch {
        // mantém o saldo da sugestão
      }
    }

    void loadPoints();
    const t = window.setInterval(() => void loadPoints(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [open, cedenteId, program]);

  if (!open) return null;

  const stepsForProgram: Step[] =
    program === "LATAM"
      ? ["creds", "code", "search", "extension", "order"]
      : ["creds", "code"];

  const stepIndex = stepsForProgram.indexOf(step);
  const ptsNaConta =
    liveAccountPoints != null ? liveAccountPoints : Math.max(0, Math.trunc(accountPoints));
  const ptsEmissao = Math.max(0, Math.trunc(salePoints));
  const ptsSobra = ptsNaConta - ptsEmissao;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xl shadow-slate-900/20 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold tracking-tight text-slate-900">
              {program === "LATAM" ? "Biometria LATAM" : "Acesso Smiles"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Passo {stepIndex + 1} de {stepsForProgram.length}
              {cedenteNome ? ` • ${cedenteNome}` : ""}
              {whatsappPhoneLabel ? ` • ${whatsappPhoneLabel}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex gap-1.5">
          {stepsForProgram.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i <= stepIndex ? "bg-slate-900" : "bg-slate-200"
              )}
            />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Na conta
            </div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
              {fmtPts(ptsNaConta)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Esta emissão
            </div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
              {fmtPts(ptsEmissao)}
            </div>
          </div>
          <div
            className={cn(
              "rounded-xl border px-3 py-2",
              ptsSobra < 0
                ? "border-rose-200 bg-rose-50"
                : "border-emerald-200 bg-emerald-50"
            )}
          >
            <div
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wide",
                ptsSobra < 0 ? "text-rose-700" : "text-emerald-800"
              )}
            >
              Vai sobrar
            </div>
            <div
              className={cn(
                "mt-0.5 text-sm font-bold tabular-nums",
                ptsSobra < 0 ? "text-rose-800" : "text-emerald-900"
              )}
            >
              {fmtPts(ptsSobra)}
            </div>
          </div>
        </div>

        {step === "creds" ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="font-semibold text-slate-900">
                1. Credenciais da conta {programLabel(program)}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Peça ao cedente para logar no site e te enviar o código do e-mail.
              </p>

              <EmailNaoSincronizadoAviso
                className="mt-3"
                cedenteId={cedenteId}
                emailRedirecionado={creds?.emailRedirecionado}
              />

              {loadingCreds ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Carregando credenciais…
                </div>
              ) : credsError ? (
                <div className="mt-3 text-sm text-rose-600">{credsError}</div>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <CredBox label="CPF / Login" value={cpf} />
                  <CredBox label={`Senha ${programLabel(program)}`} value={programPass} />
                  <CredBox label="E-mail" value={email} />
                  <CredBox label="Senha do e-mail" value={emailPass} />
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyText(openSiteUrl(program))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Copiar link
                </button>
                <button
                  type="button"
                  onClick={() => {
                    markCodeWatch();
                    window.open(openSiteUrl(program), "_blank", "noopener,noreferrer");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-slate-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Abrir link
                </button>
              </div>

              <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Mensagem pronta
              </div>
              <div className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-700">
                {loginMessage}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyText(loginMessage)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  Copiar mensagem
                </button>
                <button
                  type="button"
                  disabled={!loginWaUrl}
                  onClick={() => {
                    if (!loginWaUrl) return;
                    // Marca o horário do envio para filtrar códigos antigos.
                    markCodeWatch();
                    window.open(loginWaUrl, "_blank", "noopener,noreferrer");
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium",
                    loginWaUrl
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                  )}
                >
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                  Enviar por WhatsApp
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={startCodeStep}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Seguir
              </button>
            </div>
          </div>
        ) : null}

        {step === "code" ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="font-semibold text-slate-900">2. Código de verificação</div>
              <p className="mt-1 text-xs text-slate-500">
                Busca o código mais recente da {programLabel(program)} deste
                cedente — puxa até 3 min antes; contador de 5 min desde a
                chegada (ENC/Fwd do Outlook também)
                {codeWatchAfter
                  ? ` · a partir de ${new Date(codeWatchAfter).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""}
                .
              </p>

              {!manualMode && otpSynced ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                  {otpLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Procurando o último código no Gmail…
                    </div>
                  ) : otpCode ? (
                    <div>
                      <div className="text-xs font-medium text-emerald-700">
                        Último código encontrado
                      </div>
                      <div className="mt-1 font-mono text-3xl font-bold tracking-widest text-slate-900">
                        {otpCode}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {formatArrivedAt(otpMeta?.date) ? (
                          <div className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                            Chegou às {formatArrivedAt(otpMeta?.date)}
                          </div>
                        ) : null}
                        <OtpCountdown
                          arrivedIso={otpMeta?.date}
                          program={program}
                        />
                      </div>
                      {otpMeta?.subject ? (
                        <div className="mt-1.5 text-xs text-slate-500">{otpMeta.subject}</div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void copyText(otpCode)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium hover:bg-slate-50"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Copiar código
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600">
                      Ainda não chegou um código novo deste cedente nesse intervalo.
                    </div>
                  )}
                  {otpError ? <div className="mt-2 text-xs text-rose-600">{otpError}</div> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void fetchOtp()}
                      disabled={otpLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {otpLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Atualizar
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualMode(true)}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Fazer manual
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <div className="text-sm font-semibold text-amber-950">
                    {otpReason === "cedente_sem_email" || !email
                      ? "Cedente sem e-mail cadastrado"
                      : otpReason === "gmail_not_configured"
                      ? "Caixa da empresa não conectada"
                      : "Modo manual"}
                  </div>
                  <p className="mt-1 text-xs text-amber-900">
                    Peça ao cedente para abrir o e-mail e te enviar o código. Credenciais:
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <CredBox label="E-mail" value={email} />
                    <CredBox label="Senha do e-mail" value={emailPass} />
                  </div>
                  <div className="mt-3 whitespace-pre-wrap rounded-xl border border-amber-200 bg-white px-3 py-2 text-[11px] text-slate-700">
                    {manualEmailMessage}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(manualEmailMessage)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copiar mensagem
                    </button>
                    <button
                      type="button"
                      disabled={!manualEmailWaUrl}
                      onClick={() => {
                        if (!manualEmailWaUrl) return;
                        window.open(manualEmailWaUrl, "_blank", "noopener,noreferrer");
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium",
                        manualEmailWaUrl
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "cursor-not-allowed border-slate-200 text-slate-400"
                      )}
                    >
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                      WhatsApp
                    </button>
                    {email ? (
                      <button
                        type="button"
                        onClick={() => {
                          setManualMode(false);
                          void fetchOtp();
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-slate-50"
                      >
                        Tentar puxar do Gmail
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setStep("creds")}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Voltar
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={goAfterCode}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <SkipForward className="h-4 w-4" aria-hidden />
                  Pular
                </button>
                <button
                  type="button"
                  onClick={goAfterCode}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {otpCode ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                      Seguir com código
                    </>
                  ) : (
                    "Seguir"
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === "search" ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="font-semibold text-slate-900">
                3. Link de pesquisa (milhas)
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Preencha o trecho para abrir a busca LATAM já em milhas (
                <span className="font-mono">redemption=true</span>). Adultos/crianças/bebês
                vêm da venda — bebê entra no link, mas não conta CPF do cedente.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSearchTrip("IDA")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                    searchTrip === "IDA"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  Somente ida
                </button>
                <button
                  type="button"
                  onClick={() => setSearchTrip("IDA_VOLTA")}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                    searchTrip === "IDA_VOLTA"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  Ida e volta
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    De (IATA)
                  </label>
                  <input
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-slate-900/10"
                    value={searchOrigin}
                    maxLength={3}
                    onChange={(e) => setSearchOrigin(toIata(e.target.value))}
                    placeholder="SAO"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Para (IATA)
                  </label>
                  <input
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-slate-900/10"
                    value={searchDestination}
                    maxLength={3}
                    onChange={(e) => setSearchDestination(toIata(e.target.value))}
                    placeholder="POA"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Data ida
                  </label>
                  <input
                    type="date"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10"
                    value={searchOutbound}
                    onChange={(e) => setSearchOutbound(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Data volta
                  </label>
                  <input
                    type="date"
                    disabled={searchTrip !== "IDA_VOLTA"}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100 disabled:text-slate-400"
                    value={searchInbound}
                    onChange={(e) => setSearchInbound(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Adultos (12+) · CPF
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={9}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10"
                    value={searchAdt}
                    onChange={(e) =>
                      setSearchAdt(Math.max(1, Math.min(9, Number(e.target.value) || 1)))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Crianças · CPF
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={9}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10"
                      value={searchChd}
                      onChange={(e) =>
                        setSearchChd(Math.max(0, Math.min(9, Number(e.target.value) || 0)))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Bebês · sem CPF
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={9}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-900/10"
                      value={searchInf}
                      onChange={(e) =>
                        setSearchInf(Math.max(0, Math.min(9, Number(e.target.value) || 0)))
                      }
                    />
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                No link: <span className="font-mono">adt={searchAdt}</span>
                {" · "}
                <span className="font-mono">chd={searchChd}</span>
                {" · "}
                <span className="font-mono">inf={searchInf}</span>
                {" · "}
                CPF do cedente:{" "}
                <b className="tabular-nums text-slate-800">
                  {Math.max(1, searchAdt + searchChd)}
                </b>
              </p>

              {searchLink ? (
                <div className="mt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                    Link gerado (milhas)
                  </div>
                  <div className="mt-1 break-all rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-[11px] text-slate-800">
                    {searchLink}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(searchLink)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copiar link
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        window.open(searchLink, "_blank", "noopener,noreferrer")
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-800 hover:bg-sky-100"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      Abrir pesquisa LATAM
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-[11px] text-slate-500">
                  Preencha origem, destino e datas para gerar o link.
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setStep("code")}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Voltar
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep("extension")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <SkipForward className="h-4 w-4" aria-hidden />
                  Pular
                </button>
                <button
                  type="button"
                  onClick={() => setStep("extension")}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Seguir
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === "extension" ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="font-semibold text-slate-900">
                4. Extensão LATAM
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Prepare passageiros e cartão para preencher na LATAM. Desmarque
                só se for emitir sem a extensão.
              </p>

              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={useLatamExtension}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setUseLatamExtension(on);
                      if (on) {
                        void loadLatamEmployeesForCards();
                        void loadLatamPaymentCards();
                      } else void syncLatamExtensionSession(false);
                    }}
                  />
                  Usar extensão LATAM
                </label>

                {useLatamExtension ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          Passageiros (foto do doc ou colar texto)
                        </div>
                        <label
                          className={cn(
                            "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50",
                            docExtracting && "pointer-events-none opacity-60"
                          )}
                        >
                          {docExtracting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          {docExtracting ? "Lendo…" : "Ler documentos"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/jpg"
                            multiple
                            className="hidden"
                            disabled={docExtracting}
                            onChange={(e) => {
                              void extractDocumentsFromFiles(e.target.files);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500">
                        RG, CIN, CNH ou certidão (até 8 fotos). Revise o texto
                        antes de preparar a extensão.
                      </p>
                      <textarea
                        className="mt-1 min-h-[120px] w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                        value={latamPassengerText}
                        onChange={(e) => setLatamPassengerText(e.target.value)}
                        placeholder={
                          "Isabella Angelis\nNasc 08/07/1982\nCPF 71912231115\n\nOvidio Angelis\n...\n\nemail@exemplo.com\n11999999999\n(1 e-mail + 1 tel → todos; se omitir → titular do cartão)"
                        }
                      />
                      {docExtractError ? (
                        <p className="mt-1 text-[11px] font-medium text-amber-800">
                          {docExtractError}
                        </p>
                      ) : null}
                      {docExtractWarnings.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 text-[10px] text-slate-500">
                          {docExtractWarnings.map((w, i) => (
                            <li key={`${w}-${i}`}>• {w}</li>
                          ))}
                        </ul>
                      ) : null}
                      {latamParsedPassengers.length > 0 ? (
                        <ul className="mt-1.5 space-y-1.5 text-[11px] text-slate-600">
                          {latamParsedPassengers.map((p, i) => {
                            const cpfOk =
                              p.cpfValid !== false &&
                              (!p.cpf || isValidCpf(p.cpf));
                            const cpfBad = Boolean(p.cpf && !cpfOk);
                            const cpfGen = Boolean(p.cpfGenerated);
                            const missingBirth = !p.birthDate;
                            return (
                            <li
                              key={`${p.cpf || p.firstName}-${i}`}
                              className={
                                missingBirth
                                  ? "rounded-md border border-red-200 bg-red-50 px-2 py-1.5"
                                  : cpfBad
                                  ? "rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5"
                                  : cpfGen
                                    ? "rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5"
                                  : "rounded-md bg-slate-50 px-2 py-1.5"
                              }
                            >
                              <div>
                                {i + 1}.{" "}
                                <b>
                                  {[p.firstName, p.lastName]
                                    .filter(Boolean)
                                    .join(" ") || "(sem nome)"}
                                </b>
                                {p.gender
                                  ? ` · ${p.gender === "F" ? "Fem" : "Masc"}`
                                  : ""}
                              </div>
                              <div className="mt-0.5 text-slate-500">
                                {p.birthDateBR ? (
                                  `Nasc ${p.birthDateBR}`
                                ) : (
                                  <span className="font-semibold text-red-700">
                                    Nasc obrigatório
                                  </span>
                                )}
                                {" · "}
                                {p.cpf ? (
                                  cpfBad ? (
                                    <span className="font-semibold text-amber-800">
                                      CPF {p.cpf} (incorreto)
                                    </span>
                                  ) : cpfGen ? (
                                    <span className="font-semibold text-sky-800">
                                      CPF {p.cpf} (gerado)
                                    </span>
                                  ) : (
                                    `CPF ${p.cpf}`
                                  )
                                ) : (
                                  "CPF —"
                                )}
                                {" · "}
                                {p.email || "e-mail —"}
                                {" · "}
                                {p.phone ? `Tel ${p.phone}` : "tel —"}
                              </div>
                              {cpfBad ? (
                                <div className="mt-1 text-[10px] font-semibold text-amber-800">
                                  CPF inválido — confira os dígitos antes de
                                  emitir. O valor não foi apagado.
                                </div>
                              ) : null}
                              {cpfGen && !cpfBad ? (
                                <div className="mt-1 text-[10px] font-semibold text-sky-800">
                                  CPF gerado automaticamente (não veio no
                                  texto). Cliente altera no check-in.
                                </div>
                              ) : null}
                              {missingBirth ? (
                                <div className="mt-1 text-[10px] font-semibold text-red-700">
                                  Data de nascimento é obrigatória — complete no
                                  texto.
                                </div>
                              ) : null}
                            </li>
                            );
                          })}
                        </ul>
                      ) : latamPassengerText.trim() ? (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Não deu para organizar — confira o formato.
                          {latamAiParsing
                            ? " Tentando leitura inteligente…"
                            : expectedPassengerCount >
                                latamRegexPassengers.length
                              ? ` (achou ${latamRegexPassengers.length} de ${expectedPassengerCount})`
                              : ""}
                        </p>
                      ) : null}
                      {latamMissingBirth.length > 0 ? (
                        <p className="mt-1 text-[11px] font-medium text-red-700">
                          {latamMissingBirth.length} passageiro
                          {latamMissingBirth.length === 1 ? "" : "s"} sem data de
                          nascimento. Não dá para emitir sem isso.
                        </p>
                      ) : null}
                      {latamAiParsing ? (
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                          Completando leitura dos passageiros…
                        </p>
                      ) : null}
                      {latamParseSource === "openai" &&
                      latamParsedPassengers.length > 0 ? (
                        <p className="mt-1 text-[11px] text-sky-700">
                          Lista ajustada automaticamente ({latamParsedPassengers.length}{" "}
                          passageiro
                          {latamParsedPassengers.length === 1 ? "" : "s"}).
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        Cartão (taxa / pagamento)
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Cartão empresa = taxa de embarque da Vias Aéreas. Cartão
                        do funcionário = taxa dele. CVV você digita na LATAM.
                      </p>
                      <select
                        className="mt-1.5 mb-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
                        value={latamCardOwnerId || getSession()?.id || ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          setLatamCardOwnerId(id);
                          setLatamPaymentCardId("");
                          void loadLatamPaymentCards(id);
                        }}
                      >
                        <option value={VIAS_OWNER_ID}>
                          Vias Aéreas (empresa)
                        </option>
                        {latamEmployees.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.login}
                            {u.id === getSession()?.id ? " (você)" : ""}
                          </option>
                        ))}
                      </select>
                      <select
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
                        value={latamPaymentCardId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setLatamPaymentCardId(id);
                          const card = latamPaymentCards.find((c) => c.id === id);
                          if (card?.isCompany) {
                            setLatamCardOwnerId(VIAS_OWNER_ID);
                          } else if (card?.userId) {
                            setLatamCardOwnerId(card.userId);
                          }
                        }}
                      >
                        <option value="">Sem cartão (só passageiros)</option>
                        {latamPaymentCards.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.isCompany ? "Vias Aéreas · " : ""}
                            {c.label} · •••• {c.last4}
                            {c.isDefaultBoarding ? " (padrão taxa)" : ""}
                          </option>
                        ))}
                      </select>
                      {latamCardOwnerId === VIAS_OWNER_ID ||
                      latamPaymentCards.find((c) => c.id === latamPaymentCardId)
                        ?.isCompany ? (
                        <p className="mt-1 text-[11px] font-medium text-violet-700">
                          Taxa de embarque desta emissão: Vias Aéreas
                        </p>
                      ) : null}
                      {latamPaymentCards.length === 0 ? (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Nenhum cartão cadastrado. Cadastre em{" "}
                          <Link
                            href="/dashboard/funcionarios/dados-pagamento"
                            className="font-semibold text-sky-700 underline"
                            target="_blank"
                          >
                            Dados de pagamento
                          </Link>
                          .
                        </p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      disabled={
                        latamExtSyncing || latamMissingBirth.length > 0
                      }
                      onClick={() => void syncLatamExtensionSession(true)}
                      className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {latamExtSyncing ? (
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden
                        />
                      ) : null}
                      Preparar extensão
                    </button>
                    {latamExtMsg ? (
                      <p className="text-[11px] text-slate-600">{latamExtMsg}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setStep("search")}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Voltar
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStep("order")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <SkipForward className="h-4 w-4" aria-hidden />
                  Pular
                </button>
                <button
                  type="button"
                  onClick={() => setStep("order")}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Seguir
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === "order" ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="font-semibold text-slate-900">
                5. Order ID e link de pagamento
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Cole o link da reserva ou o Order ID. Se preferir, pule e siga para a emissão.
              </p>
              <input
                className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-slate-900/10"
                value={orderLinkInput}
                onChange={(e) => setOrderLinkInput(e.target.value)}
                placeholder="Link com orderId ou Order ID (LA…)"
              />
              {orderLinkInput.trim() && !extractedOrderId ? (
                <div className="mt-2 text-[11px] text-rose-600">
                  Order ID inválido (precisa começar com LA).
                </div>
              ) : null}
              {extractedOrderId ? (
                <div className="mt-2 text-[11px] text-emerald-700">
                  Order ID: <b className="font-mono">{extractedOrderId}</b>
                </div>
              ) : null}
              {pagamentoLink ? (
                <div className="mt-3">
                  <div className="break-all rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-[11px]">
                    {pagamentoLink}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(pagamentoLink)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copiar link
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        window.open(pagamentoLink, "_blank", "noopener,noreferrer")
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-800"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      Abrir pagamento
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="font-semibold text-slate-900">
                Link da biometria (Unico)
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Cole o link do intro ou do process. O intro é convertido automaticamente para o
                link que o cedente deve abrir.
              </p>
              <input
                className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-slate-900/10"
                value={bioLinkInput}
                onChange={(e) => setBioLinkInput(e.target.value)}
                placeholder="https://cadastro.unico.app/flow/intro?…&id=…"
              />
              {bioLinkInput.trim() && !bioLinkNormalized ? (
                <div className="mt-2 text-[11px] text-rose-600">
                  Link Unico inválido. Use o intro (com id=) ou o /process/….
                </div>
              ) : null}
              {bioLinkNormalized ? (
                <div className="mt-3">
                  <div className="break-all rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-[11px]">
                    {bioLinkNormalized}
                  </div>
                  {bioLinkNormalized !== bioLinkInput.trim() ? (
                    <div className="mt-1.5 text-[11px] text-emerald-700">
                      Convertido do intro → process
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(bioLinkNormalized)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copiar link
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText(bioSendMessage)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copiar mensagem
                    </button>
                    <button
                      type="button"
                      disabled={!bioWaUrl}
                      onClick={() => {
                        if (!bioWaUrl) return;
                        window.open(bioWaUrl, "_blank", "noopener,noreferrer");
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium",
                        bioWaUrl
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "cursor-not-allowed border-slate-200 text-slate-400"
                      )}
                    >
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                      Enviar por WhatsApp
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setStep("extension")}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Voltar
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => finish({ purchaseCode: null, skippedOrder: true })}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <SkipForward className="h-4 w-4" aria-hidden />
                  Pular e emitir
                </button>
                <button
                  type="button"
                  disabled={!extractedOrderId}
                  onClick={() =>
                    finish({
                      purchaseCode: extractedOrderId,
                      skippedOrder: false,
                    })
                  }
                  className={cn(
                    "inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold",
                    extractedOrderId
                      ? "bg-slate-900 text-white hover:bg-slate-800"
                      : "cursor-not-allowed bg-slate-200 text-slate-500"
                  )}
                >
                  Seguir para emissão
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CredBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-900">
          {value || "—"}
        </span>
        {value ? (
          <button
            type="button"
            onClick={() => void copyText(value)}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Copiar ${label}`}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
