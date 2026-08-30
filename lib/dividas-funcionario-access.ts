export function isAdminRole(role: string | null | undefined) {
  return String(role || "").trim().toLowerCase() === "admin";
}

export function canSeeFuncionarioDebt(
  session: { id: string; role?: string },
  employeeUserId: string | null
) {
  if (isAdminRole(session.role)) return true;
  return Boolean(employeeUserId) && employeeUserId === session.id;
}

/** Só o admin cria, edita, abate, cancela ou exclui dívida de funcionário. */
export function canManageFuncionarioDebt(session: { role?: string }) {
  return isAdminRole(session.role);
}
