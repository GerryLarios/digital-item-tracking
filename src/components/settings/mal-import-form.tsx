import { buttonVariants } from "@/components/ui/button";

export function MalImportForm() {
  return (
    <form
      action="/api/library/import/mal"
      method="post"
      encType="multipart/form-data"
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <label className="grid gap-1 text-sm">
        <span className="font-medium">MyAnimeList XML</span>
        <input
          type="file"
          name="file"
          accept=".xml,text/xml,application/xml"
          required
          className="max-w-72 text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
        />
      </label>
      <button type="submit" className={buttonVariants()}>
        Import MyAnimeList
      </button>
    </form>
  );
}
