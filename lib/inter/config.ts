function env(name: string) {
  return String(process.env[name] || "").trim();
}

function wrapPemBody(label: string, body: string) {
  const b64 = body.replace(/[^A-Za-z0-9+/=]/g, "");
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
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

  const fallback = kind === "key" ? "PRIVATE KEY" : "CERTIFICATE";
  const blocks: string[] = [];
  const re = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    blocks.push(wrapPemBody(m[1].trim(), m[2]));
  }
  if (blocks.length) return blocks.join("");

  const begin = s.match(/-----BEGIN ([A-Z0-9 ]+)-----/);
  if (begin) {
    const rest = s.slice(s.indexOf(begin[0]) + begin[0].length);
    return wrapPemBody(begin[1].trim(), rest);
  }

  const compact = s.replace(/[^A-Za-z0-9+/=]/g, "");
  if (compact.length > 80) return wrapPemBody(fallback, compact);
  return s.endsWith("\n") ? s : `${s}\n`;
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
