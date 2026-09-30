import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { adminEmails, appUrl, createSession, googleRedirectUri } from "@/lib/auth";
import { getDb, bootstrapDb } from "@/lib/db";
import { users } from "@/lib/schema";

export const runtime = "nodejs";

type GoogleProfile = { email?: string; name?: string; picture?: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.headers.get("cookie")?.match(/(?:^|; )civiclens_oauth_state=([^;]+)/)?.[1];
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${appUrl()}/login?error=oauth_state`);
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: googleRedirectUri(),
        grant_type: "authorization_code"
      })
    });
    if (!tokenResponse.ok) throw new Error("Google token exchange failed");
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) throw new Error("Google did not return an access token");

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (!profileResponse.ok) throw new Error("Google profile lookup failed");
    const profile = (await profileResponse.json()) as GoogleProfile;
    const email = profile.email?.trim().toLowerCase();
    if (!email) throw new Error("Google account has no verified email");

    await bootstrapDb();
    const { db } = getDb();
    const role = adminEmails().has(email) ? "admin" : "citizen";
    const [user] = await db
      .insert(users)
      .values({ email, name: profile.name ?? email.split("@")[0], avatarUrl: profile.picture, role, lastLoginAt: new Date() })
      .onConflictDoUpdate({ target: users.email, set: { name: profile.name, avatarUrl: profile.picture, role, lastLoginAt: new Date() } })
      .returning();
    await createSession(user.id);
    const response = NextResponse.redirect(`${appUrl()}${role === "admin" ? "/admin" : "/"}`);
    response.cookies.set("civiclens_oauth_state", "", { expires: new Date(0), path: "/" });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth sign-in failed";
    return NextResponse.redirect(`${appUrl()}/login?error=${encodeURIComponent(message)}`);
  }
}