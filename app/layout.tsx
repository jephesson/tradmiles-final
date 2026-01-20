import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tradmiles-final.vercel.app"),
  title: {
    default: "TradeMiles",
    template: "%s · TradeMiles",
  },
  description: "Painel de gestão de milhas, compras e emissões.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  openGraph: {
    type: "website",
    url: "https://tradmiles-final.vercel.app",
    title: "TradeMiles",
    description: "Painel de gestão de milhas, compras e emissões.",
    siteName: "TradeMiles",
  },
  robots: { index: true, follow: true },
};

// ✅ App Router: viewport vai aqui (melhora mobile)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={[
          geistSans.variable,
          geistMono.variable,
          "antialiased",
          // ✅ fundo e altura melhor no mobile
          "min-h-dvh bg-slate-50 text-slate-900",
        ].join(" ")}
      >
        <div className="min-h-dvh flex flex-col">
          {/* ✅ wrapper global: melhora TODAS as páginas no celular */}
          <main className="flex-1">
            <div className="mx-auto w-full max-w-screen-2xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
              {children}
            </div>
          </main>

          {/* Rodapé global */}
          <footer className="px-4 py-4 sm:px-6 text-center text-xs text-neutral-500">
            Desenvolvido por <strong>Dr. Jephesson Santos</strong>
          </footer>
        </div>
      </body>
    </html>
  );
}
