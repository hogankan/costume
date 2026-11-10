import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listShows } from "@/lib/shows/store";
import { Card } from "@/components/ui";
import { removeShow } from "./actions";
import { DeleteShowButton } from "./DeleteShowButton";

export default async function ShowsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const shows = await listShows();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8">
      <Card
        title="My shows"
        subtitle="Each saved upload, with its classes. Open one to see sizes, overrides and history."
        actions={
          <Link href="/" className="text-sm font-medium underline">
            Upload a new sheet
          </Link>
        }
      >
        {shows.length === 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Nothing saved yet. Upload a sheet, then use <span className="font-medium">Save as show</span>.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-white/15">
                <th className="pb-2 pr-3 font-medium">Show</th>
                <th className="pb-2 pr-3 font-medium">Classes</th>
                <th className="pb-2 pr-3 font-medium">Last changed</th>
                <th className="pb-2 pr-3 font-medium">Saved by</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {shows.map((s) => (
                <tr key={s.id} className="border-b border-black/5 dark:border-white/10">
                  <td className="py-2 pr-3">
                    <Link href={`/shows/${s.id}`} className="font-medium underline">
                      {s.name}
                    </Link>
                    <span className="block text-xs text-neutral-500">{s.sourceFileName}</span>
                  </td>
                  <td className="py-2 pr-3">
                    {s.sizedCount} of {s.classCount} sized
                  </td>
                  <td className="py-2 pr-3">
                    {new Date(s.updatedAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2 pr-3">{s.createdBy}</td>
                  <td className="py-2 text-right">
                    {user.role === "ADMIN" ? (
                      <form action={removeShow}>
                        <input type="hidden" name="id" value={s.id} />
                        <DeleteShowButton name={s.name} />
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
