export function isAdminRole(role: string | null | undefined) {
  return String(role || "").trim().toLowerCase() === "admin";
}

/** Staff: sempre o próprio id. Admin sem asUserId: todos (null). Admin com asUserId: só essa pessoa. */
export function resolveScopedUserId(
  session: { id: string; role?: string },
  asUserIdRaw: string | null | undefined
) {
  if (!isAdminRole(session.role)) return session.id;
  const asUserId = String(asUserIdRaw || "").trim();
  return asUserId || null;
}
