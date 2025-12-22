// app/dashboard/purchases/[id]/page.tsx
import PurchaseDetailsClient from "./PurchaseDetailsClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return <PurchaseDetailsClient />;
}
