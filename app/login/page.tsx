import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic"; // evita prerender estático

export const metadata = {
  title: "Login",
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center bg-gradient-to-br from-slate-50 via-sky-50/40 to-blue-100/50 font-sans text-sm text-slate-500">
          Carregando…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
