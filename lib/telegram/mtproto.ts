import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";
import { computeCheck } from "telegram/Password";
import {
  decryptTelegramSession,
  encryptTelegramSession,
} from "@/lib/telegram/sessionCrypto";

export function telegramApiConfigured() {
  const id = Number(process.env.TELEGRAM_API_ID || "");
  const hash = String(process.env.TELEGRAM_API_HASH || "").trim();
  return Number.isInteger(id) && id > 0 && hash.length > 8;
}

export function telegramApiCreds() {
  if (!telegramApiConfigured()) {
    throw new Error(
      "Configure TELEGRAM_API_ID e TELEGRAM_API_HASH no servidor (my.telegram.org → API development tools)."
    );
  }
  return {
    apiId: Number(process.env.TELEGRAM_API_ID),
    apiHash: String(process.env.TELEGRAM_API_HASH || "").trim(),
  };
}

export function normalizeTelegramPhone(raw: string) {
  const d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return `+${d}`;
}

export function mapTelegramError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e || "");
  const err = e as { errorMessage?: string; seconds?: number };
  const code = String(err?.errorMessage || msg);
  if (/PHONE_NUMBER_INVALID/i.test(code)) return "Número de telefone inválido.";
  if (/PHONE_CODE_INVALID/i.test(code)) return "Código inválido. Confira o app do Telegram.";
  if (/PHONE_CODE_EXPIRED/i.test(code)) return "Código expirado. Peça outro.";
  if (/SESSION_PASSWORD_NEEDED/i.test(code)) return "SESSION_PASSWORD_NEEDED";
  if (/PASSWORD_HASH_INVALID|PASSWORD_INVALID/i.test(code)) {
    return "Senha de duas etapas do Telegram incorreta.";
  }
  if (/FLOOD/i.test(code)) {
    const sec = Number(err?.seconds || 0);
    return sec > 0
      ? `Telegram pediu espera de ${sec}s. Tente de novo depois.`
      : "Telegram limitou tentativas. Espere um pouco.";
  }
  if (/API_ID_INVALID/i.test(code)) return "TELEGRAM_API_ID inválido.";
  return msg.slice(0, 280) || "Falha no Telegram.";
}

function newClient(sessionStr: string) {
  const { apiId, apiHash } = telegramApiCreds();
  return new TelegramClient(new StringSession(sessionStr || ""), apiId, apiHash, {
    connectionRetries: 3,
    autoReconnect: false,
    timeout: 20,
    retryDelay: 1000,
  });
}

export async function withTelegramClient<T>(opts: {
  sessionEnc?: string | null;
  run: (client: TelegramClient) => Promise<T>;
}): Promise<{ result: T; sessionEnc: string }> {
  const sessionStr = opts.sessionEnc ? decryptTelegramSession(opts.sessionEnc) : "";
  const client = newClient(sessionStr);
  try {
    await client.connect();
    const result = await opts.run(client);
    const saved = String(client.session.save() || "");
    return { result, sessionEnc: saved ? encryptTelegramSession(saved) : opts.sessionEnc || "" };
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

export async function sendTelegramLoginCode(phone: string, sessionEnc?: string | null) {
  const { apiId, apiHash } = telegramApiCreds();
  return withTelegramClient({
    sessionEnc,
    run: async (client) => {
      const sent = await client.sendCode({ apiId, apiHash }, phone, false);
      return { phoneCodeHash: String(sent.phoneCodeHash || "") };
    },
  });
}

export async function signInTelegram(opts: {
  phone: string;
  phoneCodeHash: string;
  code: string;
  sessionEnc?: string | null;
}) {
  try {
    return await withTelegramClient({
      sessionEnc: opts.sessionEnc,
      run: async (client) => {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: opts.phone,
            phoneCodeHash: opts.phoneCodeHash,
            phoneCode: opts.code.trim(),
          })
        );
        const me = (await client.getMe()) as { id?: unknown; firstName?: string; lastName?: string };
        return {
          telegramUserId: String(me?.id || ""),
          telegramName: [me?.firstName, me?.lastName].filter(Boolean).join(" ").trim(),
        };
      },
    });
  } catch (e) {
    const mapped = mapTelegramError(e);
    if (mapped === "SESSION_PASSWORD_NEEDED") {
      const sessionEnc = (e as { sessionEnc?: string }).sessionEnc;
      void sessionEnc;
      throw Object.assign(new Error("SESSION_PASSWORD_NEEDED"), { needPassword: true as const });
    }
    throw new Error(mapped);
  }
}

export async function signInTelegramPassword(opts: {
  password: string;
  sessionEnc?: string | null;
}) {
  return withTelegramClient({
    sessionEnc: opts.sessionEnc,
    run: async (client) => {
      const pwd = await client.invoke(new Api.account.GetPassword());
      await client.invoke(
        new Api.auth.CheckPassword({
          password: await computeCheck(pwd, opts.password),
        })
      );
      const me = (await client.getMe()) as { id?: unknown; firstName?: string; lastName?: string };
      return {
        telegramUserId: String(me?.id || ""),
        telegramName: [me?.firstName, me?.lastName].filter(Boolean).join(" ").trim(),
      };
    },
  });
}

export type TelegramChatRow = {
  id: string;
  title: string;
  lastMessage: string;
};

export async function listTelegramChats(sessionEnc: string, query = "") {
  return withTelegramClient({
    sessionEnc,
    run: async (client) => {
      const dialogs = await client.getDialogs({ limit: 60 });
      const q = query.trim().toLowerCase();
      const rows: TelegramChatRow[] = [];
      for (const d of dialogs) {
        const title = String((d as { title?: string; name?: string }).title || (d as { name?: string }).name || "").trim();
        const entity = (d as { entity?: { id?: unknown } }).entity;
        const id = String(entity?.id || (d as { id?: unknown }).id || "");
        if (!id) continue;
        const msg = d.message as { message?: string } | undefined;
        const lastMessage = String(msg?.message || "").replace(/\s+/g, " ").trim().slice(0, 120);
        if (q && !title.toLowerCase().includes(q) && !lastMessage.toLowerCase().includes(q)) {
          continue;
        }
        rows.push({ id, title: title || "Conversa", lastMessage });
      }
      return rows.slice(0, 40);
    },
  });
}

export async function readTelegramChat(sessionEnc: string, chatId: string) {
  return withTelegramClient({
    sessionEnc,
    run: async (client) => {
      let entity;
      try {
        entity = await client.getEntity(chatId);
      } catch {
        entity = await client.getEntity(BigInt(chatId));
      }
      const messages = await client.getMessages(entity, { limit: 40 });
      const texts: string[] = [];
      const images: { mimeType: string; base64: string }[] = [];
      const chronological = [...messages].reverse();
      for (const m of chronological) {
        const row = m as {
          message?: string;
          photo?: unknown;
          document?: { mimeType?: string };
        };
        const text = String(row.message || "").trim();
        if (text) texts.push(text);
        const mime = String(row.document?.mimeType || "");
        const hasMedia = Boolean(row.photo) || /^image\//i.test(mime);
        if (!hasMedia || images.length >= 8) continue;
        try {
          const buf = await client.downloadMedia(m, {});
          const raw = Buffer.isBuffer(buf) ? buf : buf ? Buffer.from(buf as ArrayBuffer) : null;
          if (!raw || raw.length < 80) continue;
          images.push({ mimeType: "image/jpeg", base64: raw.toString("base64") });
        } catch {
          /* mídia que não baixa */
        }
      }
      return { texts, images };
    },
  });
}
