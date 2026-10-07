import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import ConfiguracoesPageClient from "./ConfiguracoesPageClient";
import { readSessionCookie } from "@/lib/session";

type Sess = {
  id: string;
  login: string;
  name?: string;
  team: string;
  role: "admin" | "staff";
};



export default async function Page() {
  const store = await cookies();
  const raw = store.get("tm.session")?.value;
  const sess = readSessionCookie(raw);

  if (!sess?.id || !sess?.login) {
    redirect("/login");
  }
  if (sess.role !== "admin") {
    redirect("/dashboard");
  }

  return <ConfiguracoesPageClient />;
}
