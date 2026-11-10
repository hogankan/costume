import { Wizard } from "@/components/Wizard";
import { getCurrentUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getCurrentUser();
  return <Wizard signedIn={Boolean(user)} />;
}
