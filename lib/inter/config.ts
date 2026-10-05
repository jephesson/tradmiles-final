function env(name: string) {
  return String(process.env[name] || "").trim();
}

function wrapPemBody(kind: "CERTIFICATE" | "PRIVATE KEY", body: string) {
  const b64 = body.replace(/\s+/g, "");
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${kind}-----\n${lines.join("\n")}\n-----END ${kind}-----\n`;
}

export function normalizePem(raw: string, kind: "cert" | "key") {
  let s = String(raw || "").replace(/^\uFEFF/, "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/\\n/g, "\n").replace(/\\r/g, "");
  s = s.replace(/-----BEGIN ([A-Z0-9 ]+)-----/g, "\n-----BEGIN $1-----\n");
  s = s.replace(/-----END ([A-Z0-9 ]+)-----/g, "\n-----END $1-----\n");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!/-----BEGIN [A-Z0-9 ]+-----/.test(s)) {
    const compact = s.replace(/\s+/g, "");
    if (/^[A-Za-z0-9+/]+=*$/.test(compact) && compact.length > 80) {
      s = wrapPemBody(kind === "key" ? "PRIVATE KEY" : "CERTIFICATE", compact).trim();
    }
  }

  if (s && !s.endsWith("\n")) s += "\n";
  return s;
}

function pemFromEnv(name: string, kind: "cert" | "key") {
  return normalizePem(env(name), kind);
}

export function assertInterPem() {
  if (env("INTER_PFX_BASE64")) return;
  const cert = pemFromEnv("INTER_CERT", "cert");
  const key = pemFromEnv("INTER_KEY", "key");
  if (!/-----BEGIN /.test(cert) || !/-----END /.test(cert)) {
    throw new Error(
      "INTER_CERT inválido. Cole o .crt inteiro, com as linhas -----BEGIN CERTIFICATE----- e -----END CERTIFICATE-----."
    );
  }
  if (!/-----BEGIN /.test(key) || !/-----END /.test(key)) {
    throw new Error(
      "INTER_KEY inválida. Cole o .key inteiro, com -----BEGIN PRIVATE KEY----- (ou RSA PRIVATE KEY) e o END."
    );
  }
}

export function interSandbox() {
  return env("INTER_SANDBOX") === "1" || env("INTER_SANDBOX").toLowerCase() === "true";
}

export function interConfigured() {
  return Boolean(
    env("INTER_CLIENT_ID") &&
      env("INTER_CLIENT_SECRET") &&
      (pemFromEnv("INTER_CERT", "cert") || env("INTER_PFX_BASE64")) &&
      (pemFromEnv("INTER_KEY", "key") || env("INTER_PFX_BASE64"))
  );
}

export function interConfig() {
  const sandbox = interSandbox();
  return {
    sandbox,
    clientId: env("INTER_CLIENT_ID"),
    clientSecret: env("INTER_CLIENT_SECRET"),
    cert: pemFromEnv("INTER_CERT", "cert"),
    key: pemFromEnv("INTER_KEY", "key"),
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
