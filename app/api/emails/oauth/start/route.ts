import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-session";
import { oauthClientCredentials } from "@/lib/gmail/client";
import {
  GMAIL_OAUTH_STATE_COOKIE,
  appOriginFromRequest,
  buildGoogleAuthUrl,
  gmailOAuthRedirectUri,
  hashOAuthState,
  newOAuthState,
} from "@/lib/gmail/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = appOriginFromRequest(req);

  try {
    requireAdmin(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Não autenticado";
    if (msg.includes("admin")) {
      return NextResponse.redirect(`${origin}/dashboard/emails?oauth=admin_only`);
    }
    return NextResponse.redirect(`${origin}/login`);
  }

  const { clientId, clientSecret } = oauthClientCredentials();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/dashboard/emails?oauth=missing_client`);
  }

  const state = newOAuthState();
  const redirectUri = gmailOAuthRedirectUri(req);
  const authUrl = buildGoogleAuthUrl({ clientId, redirectUri, state });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set({
    name: GMAIL_OAUTH_STATE_COOKIE,
    value: hashOAuthState(state),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return res;
}
