import Image from "next/image";

/**
 * Arte de fundo (globo, rotas, avião, nuvens). Arquivo em /public/login-background.png
 */
export default function LoginSkyBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="relative min-h-screen w-full">
        <Image
          src="/login-background.png"
          alt=""
          fill
          className="object-cover object-center"
          priority
          sizes="100vw"
          quality={92}
        />
      </div>
    </div>
  );
}
