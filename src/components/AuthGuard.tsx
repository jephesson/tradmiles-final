// components/AuthGuard.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      const needsAuth = pathname.startsWith("/dashboard");

      try {
        const r = await fetch("/api/session", { cache: "no-store" });
        const { hasSession } = (await r.json()) as { hasSession: boolean };

        if (!alive) return;

        if (needsAuth && !hasSession) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        } else if (pathname === "/login" && hasSession) {
          router.replace("/dashboard");
        }
      } catch {
        if (needsAuth) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        }
      } finally {
        if (alive) setChecked(true);
      }
    })();

    return () => { alive = false; };
  }, [pathname, router]);

  if (!checked) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-600">
        Carregando…
      </div>
    );
  }

  return <>{children}</>;
}
