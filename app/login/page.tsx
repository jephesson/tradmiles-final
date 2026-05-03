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
        <div className="flex min-h-[60vh] items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100/80 font-sans text-sm text-slate-500">
          Carregando…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
