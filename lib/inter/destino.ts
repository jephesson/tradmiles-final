import { prisma } from "@/lib/prisma";
import { normalizePixKey, pixKeyLooksValid } from "@/lib/inter/pix-key";

export type PixDestino = {
  nome: string;
  cpf: string | null;
  banco: string | null;
  pixTipo: string;
  pixKey: string;
  source: string;
  cpfMatchesKey: boolean | null;
};

function cpfMatch(tipo: string, key: string, cpf: string | null) {
  if (String(tipo).toUpperCase() !== "CPF") return null;
  const a = key.replace(/\D/g, "");
  const b = String(cpf || "").replace(/\D/g, "");
  if (a.length !== 11 || b.length !== 11) return null;
  return a === b;
}

export async function employeePixDestino(userId: string): Promise<PixDestino> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, login: true, cpf: true, pixTipo: true, chavePix: true },
  });
  if (!user) throw new Error("Funcionário não encontrado.");

  if (user.chavePix && user.pixTipo) {
    const pixKey = normalizePixKey(user.pixTipo, user.chavePix);
    if (!pixKeyLooksValid(user.pixTipo, pixKey)) {
      throw new Error("Chave PIX do funcionário inválida.");
    }
    return {
      nome: user.name || user.login,
      cpf: user.cpf || null,
      banco: null,
      pixTipo: user.pixTipo,
      pixKey,
      source: "cadastro do funcionário",
      cpfMatchesKey: cpfMatch(user.pixTipo, pixKey, user.cpf),
    };
  }

  const cpf = String(user.cpf || "").replace(/\D/g, "");
  if (cpf.length === 11) {
    const cedente = await prisma.cedente.findFirst({
      where: { cpf },
      select: {
        nomeCompleto: true,
        cpf: true,
        banco: true,
        pixTipo: true,
        chavePix: true,
      },
    });
    if (cedente?.chavePix) {
      const pixKey = normalizePixKey(cedente.pixTipo, cedente.chavePix);
      if (!pixKeyLooksValid(cedente.pixTipo, pixKey)) {
        throw new Error("Chave PIX do cedente (mesmo CPF) inválida.");
      }
      return {
        nome: cedente.nomeCompleto || user.name || user.login,
        cpf: cedente.cpf || user.cpf || null,
        banco: cedente.banco || null,
        pixTipo: cedente.pixTipo,
        pixKey,
        source: "cedente com o mesmo CPF",
        cpfMatchesKey: cpfMatch(cedente.pixTipo, pixKey, cedente.cpf || user.cpf),
      };
    }
  }

  throw new Error(
    "Funcionário sem chave PIX. Cadastre em Dados de pagamento (ou no cedente com o mesmo CPF)."
  );
}

export async function cedentePixDraft(cedenteId: string): Promise<{
  destino: PixDestino;
  needsPix: boolean;
  error: string | null;
}> {
  const cedente = await prisma.cedente.findUnique({
    where: { id: cedenteId },
    select: {
      nomeCompleto: true,
      cpf: true,
      banco: true,
      pixTipo: true,
      chavePix: true,
      identificador: true,
    },
  });
  if (!cedente) throw new Error("Cedente não encontrado.");

  const pixTipo = cedente.pixTipo || "CPF";
  const raw = String(cedente.chavePix || "").trim();
  const fallbackCpf = String(cedente.cpf || "").replace(/\D/g, "");
  const suggested = raw || (pixTipo === "CPF" && fallbackCpf.length === 11 ? fallbackCpf : "");
  const pixKey = suggested ? normalizePixKey(pixTipo, suggested) : "";
  const valid = Boolean(pixKey) && pixKeyLooksValid(pixTipo, pixKey);

  const destino: PixDestino = {
    nome: cedente.nomeCompleto,
    cpf: cedente.cpf || null,
    banco: cedente.banco || null,
    pixTipo,
    pixKey: valid ? pixKey : suggested,
    source: `cedente ${cedente.identificador}`,
    cpfMatchesKey: valid ? cpfMatch(pixTipo, pixKey, cedente.cpf) : null,
  };

  if (!raw) {
    return { destino, needsPix: true, error: "Cedente sem chave PIX cadastrada." };
  }
  if (!valid) {
    return { destino, needsPix: true, error: "Chave PIX do cedente inválida." };
  }
  return { destino, needsPix: false, error: null };
}

export async function cedentePixDestino(cedenteId: string): Promise<PixDestino> {
  const draft = await cedentePixDraft(cedenteId);
  if (draft.needsPix) {
    throw new Error(draft.error || "Chave PIX do cedente inválida.");
  }
  return draft.destino;
}
