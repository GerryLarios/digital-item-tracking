import { buttonVariants } from "@/components/ui/button";
import type { MalImportFailure } from "@/lib/library/mal-import";

export function MalFailuresList({ failures }: { failures: MalImportFailure[] }) {
  if (!failures.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <form action="/api/library/import/mal/retry" method="post">
        <button
          type="submit"
          className={buttonVariants({ variant: "outline" })}
        >
          Retry MyAnimeList failures ({failures.length})
        </button>
      </form>
      <details className="max-w-96 text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Show failures
        </summary>
        <ul className="mt-2 space-y-2">
          {failures.map((failure) => (
            <li key={failure.externalId}>
              <span className="font-medium">{failure.title}</span> (ID{" "}
              {failure.externalId}):{" "}
              <span className="text-destructive">{failure.error}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
