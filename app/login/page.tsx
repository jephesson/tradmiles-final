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
        <div className="flex min-h-[60vh] items-center justify-center bg-[linear-gradient(168deg,#cfe8f5_0%,#f2f8fc_42%,#e5f0f9_100%)] font-sans text-sm text-slate-500">
          Carregando…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
