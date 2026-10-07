export function sessionSecret() {
  return (
    process.env.SESSION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.DATABASE_URL ||
    ""
  ).trim();
}

export function hasSessionSecret() {
  return sessionSecret().length >= 16;
}
