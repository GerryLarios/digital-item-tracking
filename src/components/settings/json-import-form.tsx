import { buttonVariants } from "@/components/ui/button";

export function JsonImportForm() {
  return (
    <form
      action="/api/library/import"
      method="post"
      encType="multipart/form-data"
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Library JSON</span>
        <input
          type="file"
          name="file"
          accept="application/json,.json"
          required
          className="max-w-72 text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
        />
      </label>
      <button type="submit" className={buttonVariants()}>
        Import JSON
      </button>
    </form>
  );
}
