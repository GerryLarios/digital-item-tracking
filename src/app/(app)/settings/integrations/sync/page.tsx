import Link from "next/link";

import { DetailSyncRefresh } from "@/components/settings/detail-sync-refresh";
import { ManualSyncForm } from "@/components/settings/manual-sync-form";
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
import { getProviderSyncProgress } from "@/lib/sync/provider-run";

import { toIntegrationsNotice } from "../notices";

export const metadata = {
  title: "Manual sync",
};

export const dynamic = "force-dynamic";

export default async function ManualSyncPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const notice = toIntegrationsNotice(params);
  const providerSync = getProviderSyncProgress();
  const providerSyncActive = providerSync.length > 0;

  return (
    <div className="space-y-6">
      <DetailSyncRefresh active={providerSyncActive} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manual sync</h1>
        <p className="text-sm text-muted-foreground">
          Import all enabled provider libraries now. Database leases prevent
          overlapping runs.
        </p>
      </div>
      {notice ? (
        <div className="rounded-lg border bg-background px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Run a sync</CardTitle>
          <CardDescription>
            Queued runs are processed in the background by the worker.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ManualSyncForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>
            You can leave this page while syncs continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {providerSync.length ? (
            providerSync.map((run) => (
              <div
                key={run.runId}
                className="space-y-3 rounded-lg border p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge>{PROVIDER_LABELS[run.provider]}</Badge>
                  <span className="text-muted-foreground">
                    {run.counts.processed} / {run.counts.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{
                      width: `${run.counts.total ? (run.counts.processed / run.counts.total) * 100 : 100}%`,
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                  <span>Succeeded: {run.counts.succeeded}</span>
                  <span>Failed: {run.counts.failed}</span>
                </div>
                {run.errors.length ? (
                  <ul className="space-y-2 text-destructive">
                    {run.errors.map((error) => (
                      <li
                        key={error.itemId}
                        className="flex flex-wrap items-start gap-2"
                      >
                        {error.nodeId ? (
                          <Link
                            className="font-medium underline"
                            href={`/library/${error.nodeId}`}
                          >
                            {error.title}
                          </Link>
                        ) : (
                          <span className="font-medium">{error.title}</span>
                        )}
                        <span className="flex-1">: {error.message}</span>
                        <RetryProviderRunItemForm
                          runId={run.runId}
                          itemId={error.itemId}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Provider syncs run in the background. Progress and any failed
              items will appear here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
