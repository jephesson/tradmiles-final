import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import NovaVendaClient from "./NovaVendaClient";
import { prisma } from "@/lib/prisma";
import {
  resolveEmployeeBonusAboveMetaBps,
  resolveEmployeeC1Bps,
} from "@/lib/payouts/employeeCommissionRates";
import { readSessionCookie } from "@/lib/session";

type UserLite = { id: string; name: string; login: string };

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

  const initialMe: UserLite = {
    id: sess.id,
    login: sess.login,
    name: sess.name || sess.login,
  };

  const settingsRow = await prisma.settings.upsert({
    where: { key: "default" },
    create: { key: "default" },
    update: {},
    select: { employeeC1Bps: true, employeeBonusAboveMetaBps: true },
  });
  const initialEmployeeCommission = {
    employeeC1Bps: resolveEmployeeC1Bps(settingsRow),
    employeeBonusAboveMetaBps: resolveEmployeeBonusAboveMetaBps(settingsRow),
  };

  return <NovaVendaClient initialMe={initialMe} initialEmployeeCommission={initialEmployeeCommission} />;
}
