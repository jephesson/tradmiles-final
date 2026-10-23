// Cache no navegador do Telegram da venda: a tela de vendas já começa a
// carregar status, conversas e a última conversa usada, e o picker reaproveita.

export type TelegramStatusJson = {
  ok: boolean;
  error?: string;
  configured?: boolean;
  connected?: boolean;
  status?: string | null;
  phone?: string | null;
  name?: string | null;
  lastChatId?: string | null;
  lastChatTitle?: string | null;
};

export type TelegramChatRef = {
  id: string;
  title: string;
  accessHash?: string;
};

type Entry<T> = { at: number; promise: Promise<T>; value?: T };

const TTL_MS = 3 * 60_000;
const store = new Map<string, Entry<unknown>>();

function cached<T>(key: string, load: () => Promise<T>, maxAgeMs = TTL_MS): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < Math.min(maxAgeMs, TTL_MS)) return hit.promise;
  // Mantém o valor anterior visível enquanto a versão nova não chega.
  const entry: Entry<T> = {
    at: Date.now(),
    promise: Promise.resolve() as Promise<T>,
    value: hit?.value,
  };
  entry.promise = load().then(
    (value) => {
      entry.value = value;
      return value;
    },
    (err) => {
      if (store.get(key) === entry) store.delete(key);
      throw err;
    }
  );
  store.set(key, entry as Entry<unknown>);
  return entry.promise;
}

function peek<T>(key: string): T | undefined {
  const hit = store.get(key) as Entry<T> | undefined;
  if (!hit || Date.now() - hit.at >= TTL_MS) return undefined;
  return hit.value;
}

async function getJson<T extends { ok?: boolean; error?: string }>(url: string, fallback: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as T;
  if (!json?.ok) throw new Error(json?.error || fallback);
  return json;
}

export function fetchTelegramStatus(fresh = false) {
  return cached(
    "status",
    () => getJson<TelegramStatusJson>("/api/telegram", "Falha ao ver o Telegram."),
    fresh ? 0 : TTL_MS
  );
}

export function peekTelegramStatus() {
  return peek<TelegramStatusJson>("status");
}

export type TelegramChatsJson<C> = {
  ok: boolean;
  error?: string;
  chats?: C[];
  next?: { offsetDate: number; offsetId: number; offsetPeer: string } | null;
};

/** Primeira página sem busca — a única que vale guardar. */
export function fetchTelegramChats<C>(maxAgeMs = TTL_MS) {
  return cached(
    "chats",
    () => getJson<TelegramChatsJson<C>>("/api/telegram/chats", "Falha ao listar conversas."),
    maxAgeMs
  );
}

export function peekTelegramChats<C>() {
  return peek<TelegramChatsJson<C>>("chats");
}

export type TelegramMessagesJson<M> = { ok: boolean; error?: string; messages?: M[] };

export function fetchTelegramMessages<M>(chat: TelegramChatRef, maxAgeMs = TTL_MS) {
  const qs = new URLSearchParams({
    chatId: chat.id,
    title: chat.title,
    accessHash: chat.accessHash || "",
  });
  return cached(
    `messages:${chat.id}`,
    async () => {
      const json = await getJson<TelegramMessagesJson<M>>(
        `/api/telegram/messages?${qs}`,
        "Falha ao ler mensagens."
      );
      // O servidor grava esta como a última conversa usada.
      const status = peekTelegramStatus();
      if (status) status.lastChatId = chat.id;
      return json;
    },
    maxAgeMs
  );
}

export function peekTelegramMessages<M>(chatId: string) {
  return peek<TelegramMessagesJson<M>>(`messages:${chatId}`);
}

/** Já carregado há pouco: dá para mostrar sem buscar de novo. */
export const TELEGRAM_FRESH_MS = 30_000;

export function clearTelegramCache() {
  store.clear();
}

/** Dispara em segundo plano; erros ficam para o picker mostrar. */
export function prefetchTelegram() {
  void (async () => {
    try {
      const status = await fetchTelegramStatus();
      if (!status.connected) return;
      const chats = await fetchTelegramChats<TelegramChatRef>();
      const last = status.lastChatId
        ? (chats.chats || []).find((c) => c.id === status.lastChatId)
        : null;
      if (last) await fetchTelegramMessages(last);
    } catch {
      /* o picker tenta de novo ao abrir */
    }
  })();
}
