function env(name: string) {
  return String(process.env[name] || "").trim();
}

function pemFromEnv(name: string) {
  return env(name).replace(/\\n/g, "\n");
}

export function interSandbox() {
  return env("INTER_SANDBOX") === "1" || env("INTER_SANDBOX").toLowerCase() === "true";
}

export function interConfigured() {
  return Boolean(
    env("INTER_CLIENT_ID") &&
      env("INTER_CLIENT_SECRET") &&
      (pemFromEnv("INTER_CERT") || env("INTER_PFX_BASE64")) &&
      (pemFromEnv("INTER_KEY") || env("INTER_PFX_BASE64"))
  );
}

export function interConfig() {
  const sandbox = interSandbox();
  return {
    sandbox,
    clientId: env("INTER_CLIENT_ID"),
    clientSecret: env("INTER_CLIENT_SECRET"),
    cert: pemFromEnv("INTER_CERT"),
    key: pemFromEnv("INTER_KEY"),
    passphrase: env("INTER_KEY_PASSPHRASE"),
    pfxBase64: env("INTER_PFX_BASE64"),
    conta: env("INTER_CONTA").replace(/\D/g, "").replace(/^0+/, ""),
    tokenUrl: sandbox
      ? "https://cdpj-sandbox.partners.uatinter.co/oauth/v2/token"
      : "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
    bankingBase: sandbox
      ? "https://cdpj-sandbox.partners.uatinter.co/banking/v2"
      : "https://cdpj.partners.bancointer.com.br/banking/v2",
    scope:
      "pagamento-pix.write pagamento-pix.read webhook-banking.write webhook-banking.read",
  };
}

export function interPublicBaseUrl() {
  return (env("NEXT_PUBLIC_APP_URL") || env("INTER_WEBHOOK_BASE_URL")).replace(/\/+$/, "");
}
