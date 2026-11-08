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
        <div
          className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 font-sans text-sm text-slate-400"
        >
          Carregando…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
