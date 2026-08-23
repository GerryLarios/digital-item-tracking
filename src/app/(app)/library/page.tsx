import Link from "next/link";

import { LibraryFilterBar } from "@/components/library/filter-bar";
import { NodeCard } from "@/components/library/node-card";
import { NodeTable } from "@/components/library/node-table";
import { buttonVariants } from "@/components/ui/button";
import { buildQueryString } from "@/lib/helpers";
import { listNodes } from "@/lib/library/service";
import { librarySearchSchema } from "@/lib/validation";

export const metadata = {
  title: "Library",
};

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsedSearchParams = librarySearchSchema.parse(params);
  const results = listNodes({
    q: parsedSearchParams.q,
    mediaType: parsedSearchParams.mediaType,
    status: parsedSearchParams.status,
    provider: parsedSearchParams.provider,
    collection: parsedSearchParams.collection,
    medium: parsedSearchParams.medium,
    showHidden: parsedSearchParams.showHidden,
    showNsfw: parsedSearchParams.showNsfw,
    onlyNsfw: parsedSearchParams.onlyNsfw,
    sort: parsedSearchParams.sort,
    page: parsedSearchParams.page,
  });

  const paginationBase = {
    q: parsedSearchParams.q,
    mediaType: parsedSearchParams.mediaType,
    status: parsedSearchParams.status,
    provider: parsedSearchParams.provider,
    collection: parsedSearchParams.collection,
    medium: parsedSearchParams.medium,
    showHidden: parsedSearchParams.showHidden ? "true" : undefined,
    showNsfw: parsedSearchParams.showNsfw ? "true" : undefined,
    onlyNsfw: parsedSearchParams.onlyNsfw ? "true" : undefined,
    sort: parsedSearchParams.sort,
    view: parsedSearchParams.view,
  };

  return (
    <div className="space-y-6">
      <LibraryFilterBar
        total={results.total}
        initialQuery={parsedSearchParams.q ?? ""}
      />
      {results.items.length ? (
        parsedSearchParams.view === "list" ? (
          <NodeTable items={results.items} />
        ) : (
          <div className="divide-y divide-border/80">
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
  );
}
