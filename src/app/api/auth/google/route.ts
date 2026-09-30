import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { googleAuthUrl, googleConfigured } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  if (!googleConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 503 }
    );
  }
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(googleAuthUrl(state));
  response.cookies.set("civiclens_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/"
  });
  return response;
}