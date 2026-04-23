"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";

type SaleRow = {
  id: string;
  numero: string;
  date: string;
  program: string;
  clientName: string;
  clientIdentifier: string;
  points: number;
  passengers: number;
  totalCents: number;
  pointsValueCents: number;
  costCents: number;
  profitBrutoCents: number;
  bonusCents: number;
  profitCents: number;
  affiliateCommissionCents: number;
  paymentStatus: string;
  locator: string | null;
};

type DashboardData = {
  affiliate: {
    id: string;
    name: string;
    login: string | null;
    document: string;
    flightSalesLink: string | null;
    pointsPurchaseLink: string | null;
    commissionBps: number;
  };
  metrics: {
    clientsCount: number;
    salesCount: number;
    totalSalesCents: number;
    totalProfitCents: number;
    totalCommissionCents: number;
    commissionBps: number;
    sales: SaleRow[];
  };
};

function fmtMoney(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtPercent(bps: number) {
  return `${(Number(bps || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR");
}

function statusLabel(value: string) {
  if (value === "PAID") return "Pago";
  if (value === "CANCELED") return "Cancelado";
  return "Pendente";
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-950">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível carregar a imagem."));
    img.src = src;
  });
}

async function makeQrDataUrl(url: string, width = 360) {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width,
    color: {
      dark: "#031f4d",
      light: "#ffffff",
    },
  });
}

type FolderTemplateConfig = {
  src: string;
  baseWidth: number;
  baseHeight: number;
  qrX: number;
  qrY: number;
  qrSize: number;
};

const FOLDER_TEMPLATE_BY_TYPE: Record<"passagens" | "compra-pontos", FolderTemplateConfig> = {
  passagens: {
    src: "/affiliate-folder-passagem.png",
    baseWidth: 1122,
    baseHeight: 1402,
    qrX: 570,
    qrY: 962,
    qrSize: 248,
  },
  "compra-pontos": {
    src: "/affiliate-folder-venda-pontos.png",
    baseWidth: 1080,
    baseHeight: 1350,
    qrX: 576,
    qrY: 934,
    qrSize: 226,
  },
};

async function makeFolderDataUrl(url: string, folderType: "passagens" | "compra-pontos") {
  const templateConfig = FOLDER_TEMPLATE_BY_TYPE[folderType];
  const [template, qr] = await Promise.all([
    loadImage(templateConfig.src),
    loadImage(await makeQrDataUrl(url, 900)),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = template.naturalWidth || template.width;
  canvas.height = template.naturalHeight || template.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");

  ctx.drawImage(template, 0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width / templateConfig.baseWidth;
  const scaleY = canvas.height / templateConfig.baseHeight;
  const qrBox = {
    x: templateConfig.qrX * scaleX,
    y: templateConfig.qrY * scaleY,
    size: templateConfig.qrSize * Math.min(scaleX, scaleY),
  };

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(qrBox.x - 8 * scaleX, qrBox.y - 8 * scaleY, qrBox.size + 16 * scaleX, qrBox.size + 16 * scaleY);
  ctx.drawImage(qr, qrBox.x, qrBox.y, qrBox.size, qrBox.size);

  return canvas.toDataURL("image/png");
}

function safeFilePart(value: string) {
  return String(value || "afiliado")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "afiliado";
}

function ReferralQrCard({
  label,
  url,
  filePrefix,
  folderType,
}: {
  label: string;
  url: string | null;
  filePrefix: string;
  folderType: "passagens" | "compra-pontos";
}) {
  const [qr, setQr] = useState("");
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setQr("");
    setError("");

    if (!url) return;

    makeQrDataUrl(url, 320)
      .then((dataUrl) => {
        if (active) setQr(dataUrl);
      })
      .catch(() => {
        if (active) setError("Não foi possível gerar o QR Code.");
      });

    return () => {
      active = false;
    };
  }, [url]);

  async function downloadQr() {
    if (!qr) return;
    downloadDataUrl(qr, `${filePrefix}-qr-code.png`);
  }

  async function downloadFolder() {
    if (!url) return;
    setLoadingFolder(true);
    setError("");
    try {
      const dataUrl = await makeFolderDataUrl(url, folderType);
      downloadDataUrl(dataUrl, `${filePrefix}-folder-com-qr-code.png`);
    } catch {
      setError("Não foi possível gerar o folder.");
    } finally {
      setLoadingFolder(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid h-36 w-36 place-items-center rounded-xl border bg-white p-2">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR Code - ${label}`} className="h-full w-full" />
          ) : (
            <span className="text-center text-xs text-slate-500">
              {url ? "Gerando QR..." : "Sem link"}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-950">{label}</div>
          <a
            href={url || "#"}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block break-all text-xs font-medium text-sky-700"
          >
            {url || "Link não cadastrado"}
          </a>
          {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadQr}
              disabled={!qr}
              className="rounded-xl border px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              Baixar QR
            </button>
            <button
              type="button"
              onClick={downloadFolder}
              disabled={!url || loadingFolder}
              className="rounded-xl bg-black px-3 py-2 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loadingFolder ? "Gerando..." : "Baixar folder"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AffiliateDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/afiliado/dashboard", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Erro ao carregar painel.");
      setData(json.data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro ao carregar painel.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/afiliado/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => null);
    router.replace("/afiliado/login");
    router.refresh();
  }

  useEffect(() => {
    load();
  }, []);

  const sales = data?.metrics.sales || [];
  const lastUpdate = new Date().toLocaleString("pt-BR");

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl rounded-2xl border bg-white p-6 text-sm text-slate-600">
          Carregando painel do afiliado...
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl rounded-2xl border bg-white p-6">
          <div className="text-sm text-rose-600">{error || "Painel indisponível."}</div>
          <button
            type="button"
            onClick={logout}
            className="mt-4 rounded-xl bg-black px-4 py-2 text-sm text-white"
          >
            Voltar ao login
          </button>
        </div>
      </main>
    );
  }

  const fileBase = safeFilePart(data.affiliate.login || data.affiliate.name);

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-2xl border bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Image src="/trademiles.png" alt="TradeMiles" width={38} height={38} />
            <div>
              <h1 className="text-xl font-semibold text-slate-950">Portal do afiliado</h1>
              <p className="text-sm text-slate-600">
                {data.affiliate.name} · comissão {fmtPercent(data.affiliate.commissionBps)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={load}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-slate-800"
            >
              Sair
            </button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-5">
          <Kpi label="Clientes indicados" value={String(data.metrics.clientsCount)} />
          <Kpi label="Vendas dos indicados" value={String(data.metrics.salesCount)} />
          <Kpi label="Valor total vendido" value={fmtMoney(data.metrics.totalSalesCents)} />
          <Kpi label="Lucro total" value={fmtMoney(data.metrics.totalProfitCents)} />
          <Kpi
            label="Sua comissão"
            value={fmtMoney(data.metrics.totalCommissionCents)}
            hint={`${fmtPercent(data.metrics.commissionBps)} sobre lucro positivo`}
          />
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <ReferralQrCard
            label="Passagens"
            url={data.affiliate.flightSalesLink}
            filePrefix={`${fileBase}-passagens`}
            folderType="passagens"
          />
          <ReferralQrCard
            label="Compra de pontos"
            url={data.affiliate.pointsPurchaseLink}
            filePrefix={`${fileBase}-compra-pontos`}
            folderType="compra-pontos"
          />
        </section>

        <section className="rounded-2xl border bg-white p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Vendas dos seus indicados</h2>
              <p className="text-xs text-slate-500">
                Atualizado em {lastUpdate}. Valores de lucro são estimados pela venda sem taxa menos custo dos pontos e bônus.
              </p>
            </div>
            <div className="text-xs text-slate-500">Até 500 vendas mais recentes</div>
          </div>

          {sales.length === 0 ? (
            <div className="rounded-xl border p-4 text-sm text-slate-600">
              Ainda não há vendas para clientes indicados por você.
            </div>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Venda</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Programa</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Lucro</th>
                    <th className="px-3 py-2 text-right">Comissão</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2">{fmtDate(sale.date)}</td>
                      <td className="px-3 py-2 font-medium">{sale.numero}</td>
                      <td className="px-3 py-2">
                        <div>{sale.clientName}</div>
                        <div className="text-xs text-slate-500">{sale.clientIdentifier}</div>
                      </td>
                      <td className="px-3 py-2">{sale.program}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtMoney(sale.totalCents)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(sale.profitCents)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                        {fmtMoney(sale.affiliateCommissionCents)}
                      </td>
                      <td className="px-3 py-2">{statusLabel(sale.paymentStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
