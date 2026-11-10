import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { logout } from "@/app/login/actions";

/** Top bar: the app name, and sign-in state on the right. */
export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
        <Link href="/" className="font-semibold tracking-tight">
          Costume Sizing
        </Link>
        {user ? (
          <div className="flex items-center gap-4">
            <span className="text-neutral-600 dark:text-neutral-400">{user.name}</span>
            <Link href="/shows" className="font-medium underline">
              My shows
            </Link>
            <form action={logout}>
              <button type="submit" className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="font-medium underline">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
