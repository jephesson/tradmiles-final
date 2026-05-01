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
  commissionStatus: string;
  commissionPaidAt: string | null;
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
    promotionalYoutubeLink: string | null;
    promotionalDriveLink: string | null;
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
  clients: Array<{
    id: string;
    nome: string;
    identificador: string;
    createdAt: string;
  }>;
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
  if (value === "BALCAO") return "Balcão";
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
    qrX: 577,
    qrY: 976,
    qrSize: 239,
  },
  "compra-pontos": {
    src: "/affiliate-folder-venda-pontos.png",
    baseWidth: 819,
    baseHeight: 1024,
    qrX: 442,
    qrY: 701,
    qrSize: 170,
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
  const fallbackQrBox = {
    x: templateConfig.qrX * scaleX,
    y: templateConfig.qrY * scaleY,
    size: templateConfig.qrSize * Math.min(scaleX, scaleY),
  };
  const detectedBox = detectQrPlaceholderBox(ctx, canvas.width, canvas.height);
  const qrBox = detectedBox
    ? {
        x: detectedBox.x,
        y: detectedBox.y,
        size: Math.min(detectedBox.width, detectedBox.height),
      }
    : fallbackQrBox;

  const innerPadding = Math.max(4, Math.round(qrBox.size * 0.08));
  const drawSize = Math.max(24, Math.round(qrBox.size - innerPadding * 2));
  const drawX = Math.round(qrBox.x + (qrBox.size - drawSize) / 2);
  const drawY = Math.round(qrBox.y + (qrBox.size - drawSize) / 2);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(drawX - 2, drawY - 2, drawSize + 4, drawSize + 4);
  ctx.drawImage(qr, drawX, drawY, drawSize, drawSize);

  return canvas.toDataURL("image/png");
}

type Box = { x: number; y: number; width: number; height: number };

function detectQrPlaceholderBox(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): Box | null {
  const { data } = ctx.getImageData(0, 0, width, height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const candidates: Array<Box & { area: number }> = [];

  function isPlaceholderPixel(offset: number) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    const saturation = max === 0 ? 0 : (max - min) / max;
    return brightness >= 195 && saturation <= 0.12;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (visited[start]) continue;
      visited[start] = 1;
      if (!isPlaceholderPixel(start * 4)) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = start;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;

      while (head < tail) {
        const current = queue[head++];
        const cx = current % width;
        const cy = (current - cx) / width;
        area++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        if (cx > 0) {
          const left = current - 1;
          if (!visited[left]) {
            visited[left] = 1;
            if (isPlaceholderPixel(left * 4)) queue[tail++] = left;
          }
        }
        if (cx + 1 < width) {
          const right = current + 1;
          if (!visited[right]) {
            visited[right] = 1;
            if (isPlaceholderPixel(right * 4)) queue[tail++] = right;
          }
        }
        if (cy > 0) {
          const up = current - width;
          if (!visited[up]) {
            visited[up] = 1;
            if (isPlaceholderPixel(up * 4)) queue[tail++] = up;
          }
        }
        if (cy + 1 < height) {
          const down = current + width;
          if (!visited[down]) {
            visited[down] = 1;
            if (isPlaceholderPixel(down * 4)) queue[tail++] = down;
          }
        }
      }

      const componentWidth = maxX - minX + 1;
      const componentHeight = maxY - minY + 1;
      if (area < 12000) continue;
      if (componentWidth < 120 || componentHeight < 120) continue;
      const ratio = componentWidth / componentHeight;
      if (ratio < 0.7 || ratio > 1.4) continue;
      if (minX < width * 0.25 || minY < height * 0.45) continue;
      candidates.push({ x: minX, y: minY, width: componentWidth, height: componentHeight, area });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.area - a.area);
  const best = candidates[0];
  return { x: best.x, y: best.y, width: best.width, height: best.height };
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
  const [copiedKey, setCopiedKey] = useState("");
  const router = useRouter();

  async function copyLink(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((current) => (current === key ? "" : current));
      }, 1200);
    } catch {
      setError("Não foi possível copiar o link.");
    }
  }

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
          <h2 className="text-base font-semibold text-slate-950">Materiais promocionais</h2>
          <p className="mt-1 text-xs text-slate-500">
            Use os materiais oficiais para divulgação. Se os links não aparecerem, peça para o
            administrador atualizar no painel de afiliados.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.affiliate.promotionalYoutubeLink ? (
              <>
                <a
                  href={data.affiliate.promotionalYoutubeLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border px-3 py-2 text-xs hover:bg-slate-50"
                >
                  Abrir vídeo no YouTube
                </a>
                <button
                  type="button"
                  onClick={() => copyLink(data.affiliate.promotionalYoutubeLink || "", "yt")}
                  className="rounded-xl border px-3 py-2 text-xs hover:bg-slate-50"
                >
                  {copiedKey === "yt" ? "Copiado" : "Copiar link YouTube"}
                </button>
              </>
            ) : null}
            {data.affiliate.promotionalDriveLink ? (
              <>
                <a
                  href={data.affiliate.promotionalDriveLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border px-3 py-2 text-xs hover:bg-slate-50"
                >
                  Abrir vídeo no Google Drive
                </a>
                <button
                  type="button"
                  onClick={() => copyLink(data.affiliate.promotionalDriveLink || "", "drive")}
                  className="rounded-xl border px-3 py-2 text-xs hover:bg-slate-50"
                >
                  {copiedKey === "drive" ? "Copiado" : "Copiar link Drive"}
                </button>
              </>
            ) : null}
            {!data.affiliate.promotionalYoutubeLink && !data.affiliate.promotionalDriveLink ? (
              <span className="text-xs text-slate-500">Nenhum material disponível no momento.</span>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Clientes vinculados</h2>
              <p className="text-xs text-slate-500">
                Estes clientes estão vinculados ao seu código e podem gerar sua comissão de{" "}
                {fmtPercent(data.affiliate.commissionBps)} sobre lucro positivo.
              </p>
            </div>
            <div className="text-xs text-slate-500">{data.clients.length} cliente(s)</div>
          </div>

          {data.clients.length === 0 ? (
            <div className="rounded-xl border p-4 text-sm text-slate-600">
              Você ainda não possui clientes vinculados.
            </div>
          ) : (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Nome</th>
                    <th className="px-3 py-2 text-left">Identificador</th>
                    <th className="px-3 py-2 text-left">Vinculado em</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clients.map((client) => (
                    <tr key={client.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium">{client.nome}</td>
                      <td className="px-3 py-2">{client.identificador}</td>
                      <td className="px-3 py-2">{fmtDate(client.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                      <td className="px-3 py-2">{statusLabel(sale.commissionStatus)}</td>
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
