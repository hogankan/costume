import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { loadShow } from "@/lib/shows/store";
import { SavedShowView } from "@/components/SavedShowView";

export default async function ShowPage(props: PageProps<"/shows/[id]">) {
  if (!(await getCurrentUser())) redirect("/login");
  const { id } = await props.params;
  const show = await loadShow(id);
  if (!show) notFound();
  return <SavedShowView show={show} />;
}
