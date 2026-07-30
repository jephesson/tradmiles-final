import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/require-session";
import { clearAccessTokenCache, oauthClientCredentials } from "@/lib/gmail/client";
import { saveGmailConnection } from "@/lib/gmail/connection";
import {
  GMAIL_OAUTH_STATE_COOKIE,
  appOriginFromRequest,
  exchangeAuthorizationCode,
  fetchMailboxFromAccessToken,
  gmailOAuthRedirectUri,
  hashOAuthState,
} from "@/lib/gmail/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectEmails(origin: string, query: string) {
  return NextResponse.redirect(`${origin}/dashboard/emails?${query}`);
}

export async function GET(req: Request) {
  const origin = appOriginFromRequest(req);
  const url = new URL(req.url);

  let session;
  try {
    session = requireAdmin(req);
  } catch {
    return redirectEmails(origin, "oauth=admin_only");
  }

  const error = url.searchParams.get("error");
  if (error) {
    return redirectEmails(origin, `oauth=denied&detail=${encodeURIComponent(error)}`);
  }

  const code = (url.searchParams.get("code") || "").trim();
  const state = (url.searchParams.get("state") || "").trim();
  if (!code || !state) {
    return redirectEmails(origin, "oauth=invalid");
  }

  const store = await cookies();
  const expected = store.get(GMAIL_OAUTH_STATE_COOKIE)?.value || "";
  if (!expected || expected !== hashOAuthState(state)) {
    return redirectEmails(origin, "oauth=state");
  }

  const { clientId, clientSecret } = oauthClientCredentials();
  if (!clientId || !clientSecret) {
    return redirectEmails(origin, "oauth=missing_client");
  }

  try {
    const tokens = await exchangeAuthorizationCode({
      code,
      clientId,
      clientSecret,
      redirectUri: gmailOAuthRedirectUri(req),
    });

    const mailbox = await fetchMailboxFromAccessToken(tokens.accessToken);

    await saveGmailConnection({
      mailbox,
      refreshToken: tokens.refreshToken,
      connectedById: session.userId,
    });

    clearAccessTokenCache();

    const res = redirectEmails(origin, "oauth=connected");
    res.cookies.set({
      name: GMAIL_OAUTH_STATE_COOKIE,
      value: "",
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Falha no OAuth";
    return redirectEmails(origin, `oauth=error&detail=${encodeURIComponent(detail)}`);
  }
}
