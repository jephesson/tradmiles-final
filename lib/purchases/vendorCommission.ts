import { prisma } from "@/lib/prisma";

/** Comissão vendedor sobre subtotal da compra: 100 bps = 1,00%. */
export const DEFAULT_VENDOR_COMMISSION_BPS = 100;

export function clampVendorCommissionBps(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_VENDOR_COMMISSION_BPS;
  return Math.max(0, Math.min(10000, Math.trunc(n)));
}

export async function resolveVendorCommissionBps() {
  const row = await prisma.settings.findUnique({
    where: { key: "default" },
    select: { vendorCommissionBps: true },
  });
  return clampVendorCommissionBps(row?.vendorCommissionBps ?? DEFAULT_VENDOR_COMMISSION_BPS);
}
