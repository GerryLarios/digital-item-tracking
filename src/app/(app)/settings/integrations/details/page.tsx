import Link from "next/link";

import { DetailSyncRefresh } from "@/components/settings/detail-sync-refresh";
import { FailedItemRow } from "@/components/settings/failed-item-row";
import { RetryDetailSyncForm } from "@/components/settings/retry-detail-sync-form";
import { StartDetailSyncForm } from "@/components/settings/start-detail-sync-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PROVIDER_LABELS } from "@/lib/constants";
import { getDetailSyncProgress } from "@/lib/sync/detail-queue";

import { toIntegrationsNotice } from "../notices";

export const metadata = {
  title: "Item details",
};

export const dynamic = "force-dynamic";

export default async function ItemDetailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const notice = toIntegrationsNotice(params);
  const detailSync = getDetailSyncProgress();
  const detailSyncActive =
    detailSync?.status === "queued" || detailSync?.status === "running";

  return (
    <div className="space-y-6">
      <DetailSyncRefresh active={detailSyncActive} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Item details</h1>
        <p className="text-sm text-muted-foreground">
          Refresh details and artwork for every item with an active Steam or
          MyAnimeList reference. Work continues in the background.
        </p>
      </div>
      {notice ? (
        <div className="rounded-lg border bg-background px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Bulk detail sync</CardTitle>
          <CardDescription>
            You can leave this page while synchronization continues.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {detailSync ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      detailSync.status === "partial"
                        ? "outline"
                        : detailSync.status === "success"
                          ? "secondary"
                          : "default"
                    }
                  >
                    {detailSync.status}
                  </Badge>
                  {detailSync.provider ? (
                    <Badge variant="ghost">
                      {PROVIDER_LABELS[detailSync.provider]}
                    </Badge>
                  ) : null}
                </div>
                <span className="text-muted-foreground">
                  {detailSync.counts.processed} / {detailSync.counts.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{
                    width: `${detailSync.counts.total ? (detailSync.counts.processed / detailSync.counts.total) * 100 : 100}%`,
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                <span>Succeeded: {detailSync.counts.succeeded}</span>
                <span>Failed: {detailSync.counts.failed}</span>
              </div>
              {detailSync.errors.length ? (
                <ul className="space-y-2 text-destructive">
                  {detailSync.errors.slice(0, 5).map((error) => (
                    <FailedItemRow
                      key={error.id}
                      id={error.id}
                      nodeId={error.nodeId}
                      displayName={error.displayName}
                      message={error.message}
                      responseJson={error.responseJson}
                    />
                  ))}
                </ul>
              ) : null}
              {detailSync.errors.length > 5 ? (
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    Show all {detailSync.errors.length} failed items
                  </summary>
                  <ul className="mt-2 space-y-2 text-destructive">
                    {detailSync.errors.slice(5).map((error) => (
                      <FailedItemRow
                        key={error.id}
                        id={error.id}
                        nodeId={error.nodeId}
                        displayName={error.displayName}
                        message={error.message}
                        responseJson={error.responseJson}
                      />
                    ))}
                  </ul>
                </details>
              ) : null}
              {detailSync.warnings.length ? (
                <ul className="space-y-2 text-muted-foreground">
                  {detailSync.warnings.map((warning) => (
                    <li key={warning.nodeId}>
                      <Link
                        className="font-medium underline"
                        href={`/library/${warning.nodeId}`}
                      >
                        {warning.displayName}
                      </Link>
                      : {warning.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No bulk item detail sync has run yet.
            </p>
          )}
          {detailSyncActive ? null : <StartDetailSyncForm />}
          {detailSync?.status === "partial" && detailSync.counts.failed > 0 ? (
            <RetryDetailSyncForm jobId={detailSync.id} />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
