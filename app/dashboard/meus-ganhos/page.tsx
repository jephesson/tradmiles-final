import { cookies } from "next/headers";
import MeusGanhosClient from "./MeusGanhosClient";
import { readSessionCookie } from "@/lib/session";
import { VIEW_AS_EMISSOR_COOKIE, viewAsForRole } from "@/lib/viewAsEmissor";

export const dynamic = "force-dynamic";

export default async function Page() {
  const store = await cookies();
  const sess = readSessionCookie(store.get("tm.session")?.value);
  const preview = viewAsForRole(sess?.role, store.get(VIEW_AS_EMISSOR_COOKIE)?.value);
  return <MeusGanhosClient asUserId={preview?.id || null} />;
}
