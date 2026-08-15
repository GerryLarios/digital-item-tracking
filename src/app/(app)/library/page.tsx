import Link from "next/link"

import { LibraryFilterBar } from "@/components/library/filter-bar"
import { NodeCard } from "@/components/library/node-card"
import { NodeTable } from "@/components/library/node-table"
import { buttonVariants } from "@/components/ui/button"
import { listNodes } from "@/lib/library/service"
import { librarySearchSchema } from "@/lib/validation"

export const metadata = {
  title: "Library",
}

export const dynamic = "force-dynamic"

function importNotice(params: Record<string, string | string[] | undefined>) {
  if (typeof params.importError === "string") {
    return { error: true, message: params.importError }
  }
  if (typeof params.importCreated !== "string" || typeof params.importMerged !== "string") {
    return null
  }

  const artwork = Number(params.artworkSkipped ?? 0)
  return {
    error: false,
    message: `Import complete: ${Number(params.importCreated)} created, ${Number(params.importMerged)} merged.${artwork ? ` ${artwork} artwork records skipped because image files are not included.` : ""}`,
  }
}

function buildQueryString(params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue
    searchParams.set(key, String(value))
  }
  return searchParams.toString()
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const parsedSearchParams = librarySearchSchema.parse(params)
  const notice = importNotice(params)
  const results = listNodes({
    q: parsedSearchParams.q,
    mediaType: parsedSearchParams.mediaType,
    status: parsedSearchParams.status,
    provider: parsedSearchParams.provider,
    collection: parsedSearchParams.collection,
    medium: parsedSearchParams.medium,
    showHidden: parsedSearchParams.showHidden,
    showNsfw: parsedSearchParams.showNsfw,
    page: parsedSearchParams.page,
  })

  const paginationBase = {
    q: parsedSearchParams.q,
    mediaType: parsedSearchParams.mediaType,
    status: parsedSearchParams.status,
    provider: parsedSearchParams.provider,
    collection: parsedSearchParams.collection,
    medium: parsedSearchParams.medium,
    showHidden: parsedSearchParams.showHidden ? "true" : undefined,
    showNsfw: parsedSearchParams.showNsfw ? "true" : undefined,
    view: parsedSearchParams.view,
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${notice.error ? "border-destructive/50 text-destructive" : "bg-background"}`}
        >
          {notice.message}
        </div>
      ) : null}
      <div className="flex flex-col gap-4 rounded-xl border bg-background p-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-medium">Import or export library data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            JSON imports create or merge items. Artwork files and account credentials are not included.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <a
            href="/api/library/export"
            className={buttonVariants({ variant: "outline" })}
          >
            Export JSON
          </a>
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
        </div>
      </div>
      <LibraryFilterBar total={results.total} initialQuery={parsedSearchParams.q ?? ""} />
      {results.items.length ? (
        parsedSearchParams.view === "list" ? (
          <NodeTable items={results.items} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {results.items.map((item) => (
              <NodeCard key={item.id} item={item} />
            ))}
          </div>
        )
      ) : (
        <div className="rounded-xl border border-dashed bg-background p-12 text-center">
          <h2 className="text-lg font-medium">Nothing matched those filters</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a manual item or loosen the current filters.
          </p>
          <div className="mt-4 flex justify-center">
            <Link href="/library/new" className={buttonVariants()}>
              Create your first item
            </Link>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {results.page} of {results.totalPages}
        </span>
        <div className="flex gap-2">
          {results.page > 1 ? (
            <Link
              href={`/library?${buildQueryString({ ...paginationBase, page: results.page - 1 })}`}
              className="underline-offset-4 hover:underline"
            >
              Previous
            </Link>
          ) : (
            <span className="opacity-50">Previous</span>
          )}
          {results.page < results.totalPages ? (
            <Link
              href={`/library?${buildQueryString({ ...paginationBase, page: results.page + 1 })}`}
              className="underline-offset-4 hover:underline"
            >
              Next
            </Link>
          ) : (
            <span className="opacity-50">Next</span>
          )}
        </div>
      </div>
    </div>
  )
}
