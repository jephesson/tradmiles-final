/**
 * Fundo em tela cheia. Usamos <img> nativo (sem pipeline do next/image) para
 * não recompressar JPEG/PNG e evitar artefatos. Para ficar nítido em monitores
 * Arte atual: 1920×1080 PNG (upscale Lanczos a partir do JPEG do chat).
 */
export default function LoginSkyBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- evita otimização que suaviza demais o fundo */}
      <img
        src="/login-background.png"
        alt=""
        width={1920}
        height={1080}
        className="absolute inset-0 h-full w-full object-cover object-center"
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
    </div>
  );
}
