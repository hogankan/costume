"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";

export type LoginState = { error?: string; email?: string } | undefined;

/**
 * A few wrong passwords in a row lock that account out for a while, to slow
 * down guessing. Kept in memory: it resets when the app restarts, which is
 * enough for a two-account site.
 */
const attempts = new Map<string, { count: number; since: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const now = Date.now();
  const tries = attempts.get(email);
  if (tries && now - tries.since < WINDOW_MS && tries.count >= MAX_ATTEMPTS) {
    return { error: "Too many attempts. Wait 10 minutes and try again.", email };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    const fresh = !tries || now - tries.since >= WINDOW_MS;
    attempts.set(email, { count: fresh ? 1 : tries.count + 1, since: fresh ? now : tries.since });
    // Same message either way, so the form does not reveal which emails exist.
    return { error: "That email and password don't match.", email };
  }

  attempts.delete(email);
  await createSession(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/");
}
