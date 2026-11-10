"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { Alert, Button, inputClass } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
          Email
        </span>
        <input
          className={inputClass}
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state?.email}
          required
          autoFocus
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
          Password
        </span>
        <input
          className={inputClass}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state?.error ? <Alert kind="error">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
