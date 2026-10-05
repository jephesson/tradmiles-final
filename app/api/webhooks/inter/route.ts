import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse(null, { status: 204 });
}

export { POST } from "./pix-pagamento/route";
