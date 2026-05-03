/**
 * Fundo em tela cheia. Usamos <img> nativo (sem pipeline do next/image) para
 * não recompressar JPEG/PNG e evitar artefatos. Para ficar nítido em monitores
 * grandes, use arte ≥ 1920px de largura (ideal 2560px), PNG ou WebP.
 */
export default function LoginSkyBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- evita otimização que suaviza demais o fundo */}
      <img
        src="/login-background.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
    </div>
  );
}
