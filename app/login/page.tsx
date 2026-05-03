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
          className="flex min-h-[60vh] items-center justify-center bg-cover bg-center bg-no-repeat font-sans text-sm text-slate-500"
          style={{ backgroundImage: "url(/login-background.png)" }}
        >
          Carregando…
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
