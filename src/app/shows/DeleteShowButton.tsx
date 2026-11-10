"use client";

/** Asks before deleting, since a deleted show cannot be brought back. */
export function DeleteShowButton({ name }: { name: string }) {
  return (
    <button
      type="submit"
      className="text-sm text-red-700 underline dark:text-red-300"
      onClick={(e) => {
        if (!confirm(`Delete "${name}" and all its classes? This can't be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      Delete
    </button>
  );
}
