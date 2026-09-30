import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, bootstrapDb } from "./db";
import { sessions, users, type User } from "./schema";

export const SESSION_COOKIE = "civiclens_session";
const SESSION_DAYS = 14;

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function adminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI ?? `${appUrl()}/api/auth/google/callback`;
}

export function googleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account"
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function createSession(userId: number) {
  await bootstrapDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const { db } = getDb();
  await db.insert(sessions).values({ token, userId, expiresAt });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function clearSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) {
    const { db } = getDb();
    await db.delete(sessions).where(eq(sessions.token, token));
  }
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
}

export async function getSession(): Promise<User | null> {
  if (process.env.LOCAL_ADMIN_MODE === "true") {
    return {
      id: 0,
      email: "admin@localhost",
      name: "Local Administrator",
      avatarUrl: null,
      provider: "local",
      role: "admin",
      createdAt: new Date(0),
      lastLoginAt: new Date()
    };
  }
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    await bootstrapDb();
    const { db } = getDb();
    const rows = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
      .limit(1);
    return rows[0]?.user ?? null;
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const user = await getSession();
  if (!user) return { user: null, status: 401 as const };
  if (user.role !== "admin") return { user: null, status: 403 as const };
  return { user, status: 200 as const };
}

export { appUrl };