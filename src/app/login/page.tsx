import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Card } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="mx-auto w-full max-w-md px-5 py-12">
      <Card
        title="Sign in"
        subtitle="Signing in lets you save shows and come back to them. You can size costumes without an account."
      >
        <LoginForm />
      </Card>
    </div>
  );
}
