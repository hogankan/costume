import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../db";

/**
 * Database-backed sessions, as in the Next.js authentication guide.
 *
 * The browser holds a random token in an httpOnly cookie; the database holds
 * only its SHA-256, so a copy of the database cannot be used to sign in.
 * Signing out deletes the row, which ends the session immediately.
 */

const COOKIE = "session";
const LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "STAFF";
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LIFETIME_MS);
  await prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** The signed-in user, or null. Cheap enough to call from any server code. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Read the cookie first, always: that is what tells Next.js every page using
  // this is per-visitor, even in a build with no database configured.
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !process.env.DATABASE_URL) return null;
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const { id, email, name, role } = session.user;
  return { id, email, name, role };
}

export async function deleteSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  store.delete(COOKIE);
}
