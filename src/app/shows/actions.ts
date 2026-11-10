"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { deleteShow } from "@/lib/shows/store";

/** Delete a show and everything in it. Admin only. */
export async function removeShow(form: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return;
  const id = String(form.get("id") ?? "");
  if (id) await deleteShow(id);
  revalidatePath("/shows");
}
