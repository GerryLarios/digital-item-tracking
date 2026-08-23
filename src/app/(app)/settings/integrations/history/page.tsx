import Link from "next/link";

import { ClearCompletedRunsForm } from "@/components/settings/clear-completed-runs-form";
import { RetryProviderRunItemForm } from "@/components/settings/retry-provider-run-item-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PROVIDER_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/helpers";
import { listRunFailedItems, listSyncRuns } from "@/lib/sync/service";

import { toIntegrationsNotice } from "../notices";

export const metadata = {
  title: "Sync history",
};

export const dynamic = "force-dynamic";

export default async function SyncHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const notice = toIntegrationsNotice(params);
  const syncRuns = listSyncRuns(20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Run history</h1>
        <p className="text-sm text-muted-foreground">
          Every provider sync records counts, warnings, and terminal status.
        </p>
      </div>
      {notice ? (
        <div className="rounded-lg border bg-background px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Runs</CardTitle>
              <CardDescription>Latest 20 runs.</CardDescription>
            </div>
            {syncRuns.some((run) => run.status !== "running") ? (
              <ClearCompletedRunsForm />
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {syncRuns.length ? (
              syncRuns.map((run) => {
                const failedItems =
                  Number(run.stats.failedItems ?? 0) > 0
                    ? listRunFailedItems(run.id)
                    : [];
                return (
                  <div key={run.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {PROVIDER_LABELS[run.provider]}
                        </span>
                        <Badge
                          variant={
                            run.status === "failed"
                              ? "destructive"
                              : run.status === "partial"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {run.status}
                        </Badge>
                        <Badge variant="ghost">{run.trigger}</Badge>
                      </div>
                      <span className="text-muted-foreground">
                        {formatDate(run.startedAt)}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1 text-muted-foreground md:grid-cols-4">
                      <span>
                        Imported: {String(run.stats.importedItems ?? 0)}
                      </span>
                      <span>
                        Created: {String(run.stats.createdNodes ?? 0)}
                      </span>
                      <span>
                        Updated: {String(run.stats.updatedNodes ?? 0)}
                      </span>
                      <span>Failed: {String(run.stats.failedItems ?? 0)}</span>
                    </div>
                    {failedItems.length ? (
                      <ul className="mt-3 space-y-2 text-destructive">
                        {failedItems.map((item) => (
                          <li
                            key={item.itemId}
                            className="flex flex-wrap items-start gap-2"
                          >
                            {item.nodeId ? (
                              <Link
                                className="font-medium underline"
                                href={`/library/${item.nodeId}`}
                              >
                                {item.title}
                              </Link>
                            ) : (
                              <span className="font-medium">{item.title}</span>
                            )}
                            <span className="flex-1">: {item.message}</span>
                            <RetryProviderRunItemForm
                              runId={run.id}
                              itemId={item.itemId}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {Array.isArray(run.metadata.warnings) &&
                    run.metadata.warnings.length ? (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
                        {run.metadata.warnings.slice(0, 5).map((warning) => (
                          <li key={String(warning)}>{String(warning)}</li>
                        ))}
                      </ul>
                    ) : null}
                    {run.errorText ? (
                      <p className="mt-3 text-destructive">{run.errorText}</p>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                No sync runs recorded yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
