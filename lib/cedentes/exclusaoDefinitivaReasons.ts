export type ExclusionReasonCode =
  | "LATAM_FACE_NO_RESPONSE"
  | "LATAM_FACE_IMPOSSIBLE"
  | "DATA_DELETION_REQUEST";

export const EXCLUSION_REASON_TEXT: Record<ExclusionReasonCode, string> = {
  LATAM_FACE_NO_RESPONSE:
    "Ausência de resposta e/ou conclusão da biometria facial exigida pela LATAM, impossibilitando a movimentação da conta e acarretando prejuízo financeiro à empresa.",
  LATAM_FACE_IMPOSSIBLE:
    "Impossibilidade operacional de realização da biometria facial exigida pela LATAM, o que inviabiliza a continuidade das operações com segurança.",
  DATA_DELETION_REQUEST:
    "Solicitação expressa de exclusão dos dados e encerramento do vínculo operacional, com encerramento da parceria e remoção das credenciais sob nossa custódia.",
};

export function isExclusionReasonCode(value: string): value is ExclusionReasonCode {
  return value in EXCLUSION_REASON_TEXT;
}
