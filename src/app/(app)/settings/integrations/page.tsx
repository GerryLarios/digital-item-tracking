/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import {
  clearSyncHistoryAction,
  disconnectProviderAction,
  retryDetailSyncAction,
  retryDetailSyncItemAction,
  retryProviderRunItemAction,
  runSyncAction,
  startDetailSyncAction,
  updateSteamSettingsAction,
} from "@/app/actions/settings";
import { DetailSyncRefresh } from "@/components/settings/detail-sync-refresh";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROVIDER_LABELS } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { formatDate } from "@/lib/helpers";
import { getSyncAccount } from "@/lib/integrations/service";
import { getDetailSyncProgress } from "@/lib/sync/detail-queue";
import { getProviderSyncProgress } from "@/lib/sync/provider-run";
import { listRunFailedItems, listSyncRuns } from "@/lib/sync/service";

export const metadata = {
  title: "Integrations",
};

export const dynamic = "force-dynamic";

function formatJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function toNotice(searchParams: Record<string, string | string[] | undefined>) {
  if (typeof searchParams.saved === "string")
    return `${searchParams.saved} settings saved.`;
  if (typeof searchParams.synced === "string") {
    if (searchParams.synced === "queued-all") return "Provider sync queued.";
    if (searchParams.synced === "retrying")
      return "Failed item queued for re-sync.";
    if (searchParams.synced.startsWith("queued-")) {
      const provider = searchParams.synced.slice("queued-".length);
      return `${PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider} sync queued.`;
    }
    return `${searchParams.synced} sync completed.`;
  }
  if (typeof searchParams.disconnected === "string")
    return `${searchParams.disconnected} disconnected.`;
  if (typeof searchParams.connected === "string")
    return `${searchParams.connected} connected.`;
  if (searchParams.details === "queued") return "Item detail sync queued.";
  if (searchParams.details === "active")
    return "An item detail sync is already active.";
  if (searchParams.details === "retrying")
    return "Failed item details queued for retry.";
  if (searchParams.cleared === "history") return "Sync history cleared.";
  if (typeof searchParams.error === "string")
    return decodeURIComponent(searchParams.error);
  return null;
}

function FailedItemRow({
  id,
  nodeId,
  displayName,
  message,
  responseJson,
}: {
  id: string;
  nodeId: string;
  displayName: string;
  message: string | null;
  responseJson: string | null;
}) {
  return (
    <li className="flex flex-wrap items-start gap-2">
      <Link className="font-medium underline" href={`/library/${nodeId}`}>
        {displayName}
      </Link>
      <span className="flex-1">: {message}</span>
      {formatJson(responseJson) ? (
        <details className="w-full">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Raw provider response
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
            {formatJson(responseJson)}
          </pre>
        </details>
      ) : null}
      <form action={retryDetailSyncItemAction}>
        <input type="hidden" name="itemId" value={id} />
        <button
          type="submit"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Re-sync
        </button>
      </form>
    </li>
  );
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const notice = toNotice(params);
  const env = getEnv();
  const steamAccount = getSyncAccount("steam");
  const malAccount = getSyncAccount("mal");
  const syncRuns = listSyncRuns(20);
  const detailSync = getDetailSyncProgress();
  const detailSyncActive =
    detailSync?.status === "queued" || detailSync?.status === "running";
  const providerSync = getProviderSyncProgress();
  const providerSyncActive = providerSync.length > 0;

  return (
    <div className="space-y-6">
      <DetailSyncRefresh active={detailSyncActive || providerSyncActive} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Integrations & sync
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure provider connectivity, run manual syncs, and review their
          history.
        </p>
      </div>
      {notice ? (
        <div className="rounded-lg border bg-background px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Manual sync</CardTitle>
            <CardDescription>
              Import all enabled provider libraries now. Database leases prevent
              overlapping runs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={runSyncAction}>
              <input type="hidden" name="provider" value="all" />
              <button
                type="submit"
                className={buttonVariants({ variant: "outline" })}
              >
                Sync all enabled providers now
              </button>
            </form>
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
                          <form action={retryProviderRunItemAction}>
                            <input
                              type="hidden"
                              name="runId"
                              value={run.runId}
                            />
                            <input
                              type="hidden"
                              name="itemId"
                              value={error.itemId}
                            />
                            <button
                              type="submit"
                              className={buttonVariants({
                                variant: "outline",
                                size: "sm",
                              })}
                            >
                              Re-sync
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    You can leave this page while the sync continues.
                  </p>
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

        <Card>
          <CardHeader>
            <CardTitle>Item details</CardTitle>
            <CardDescription>
              Refresh details and artwork for every item with an active Steam or
              MyAnimeList reference. Work continues in the background.
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
            {detailSyncActive ? (
              <p className="text-sm text-muted-foreground">
                You can leave this page while synchronization continues.
              </p>
            ) : (
              <form action={startDetailSyncAction}>
                <button type="submit" className={buttonVariants()}>
                  Sync all item details
                </button>
              </form>
            )}
            {detailSync?.status === "partial" &&
            detailSync.counts.failed > 0 ? (
              <form action={retryDetailSyncAction}>
                <input type="hidden" name="jobId" value={detailSync.id} />
                <button
                  type="submit"
                  className={buttonVariants({ variant: "outline" })}
                >
                  Retry failed items
                </button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Steam</CardTitle>
            <CardDescription>
              Owned games and wishlist entries use Steam&apos;s Web API. Profile
              and Game details visibility must allow wishlist access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant={env.steamApiKey ? "secondary" : "destructive"}>
                API key {env.steamApiKey ? "configured" : "missing"}
              </Badge>
              {steamAccount?.config.steamId ? (
                <Badge variant="outline">
                  SteamID64 {String(steamAccount.config.steamId)}
                </Badge>
              ) : null}
              {steamAccount?.accessToken ? (
                <Badge variant="outline">
                  Private wishlist link configured
                </Badge>
              ) : null}
            </div>
            <form action={updateSteamSettingsAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="steamId">SteamID64</Label>
                <Input
                  id="steamId"
                  name="steamId"
                  defaultValue={String(steamAccount?.config.steamId ?? "")}
                  placeholder="7656119…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wishlistShareUrl">Wishlist share URL</Label>
                <Input
                  id="wishlistShareUrl"
                  name="wishlistShareUrl"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    steamAccount?.accessToken
                      ? "Configured — paste a new link to replace it"
                      : "https://store.steampowered.com/wishlist/…"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Optional fallback for a private wishlist. The link is
                  encrypted and never displayed after saving.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className={buttonVariants()} type="submit">
                  Save Steam settings
                </button>
              </div>
            </form>
            <div className="flex flex-wrap gap-2">
              <form action={runSyncAction}>
                <input type="hidden" name="provider" value="steam" />
                <button
                  type="submit"
                  className={buttonVariants({ variant: "outline" })}
                >
                  Run Steam sync now
                </button>
              </form>
              <form action={startDetailSyncAction}>
                <input type="hidden" name="provider" value="steam" />
                <button
                  type="submit"
                  className={buttonVariants({ variant: "outline" })}
                >
                  Run Steam Item Details Sync
                </button>
              </form>
              {steamAccount ? (
                <form action={disconnectProviderAction}>
                  <input type="hidden" name="provider" value="steam" />
                  <button
                    type="submit"
                    className={buttonVariants({ variant: "ghost" })}
                  >
                    Disable
                  </button>
                </form>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              Last sync: {formatDate(steamAccount?.lastSyncedAt ?? null)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MyAnimeList</CardTitle>
            <CardDescription>
              OAuth stores encrypted access and refresh tokens, imports list
              statuses, favorites, profile metadata, and cached artwork.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge
                variant={
                  env.malClientId && env.malClientSecret
                    ? "secondary"
                    : "destructive"
                }
              >
                OAuth app{" "}
                {env.malClientId && env.malClientSecret
                  ? "configured"
                  : "missing"}
              </Badge>
              {malAccount?.displayName ? (
                <Badge variant="outline">{malAccount.displayName}</Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/api/integrations/mal/connect"
                className={buttonVariants()}
              >
                Connect MAL
              </Link>
              {malAccount ? (
                <>
                  <form action={runSyncAction}>
                    <input type="hidden" name="provider" value="mal" />
                    <button
                      type="submit"
                      className={buttonVariants({ variant: "outline" })}
                    >
                      Run MAL sync now
                    </button>
                  </form>
                  <form action={startDetailSyncAction}>
                    <input type="hidden" name="provider" value="mal" />
                    <button
                      type="submit"
                      className={buttonVariants({ variant: "outline" })}
                    >
                      Run MAL Item Details Sync
                    </button>
                  </form>
                  <form action={disconnectProviderAction}>
                    <input type="hidden" name="provider" value="mal" />
                    <button
                      type="submit"
                      className={buttonVariants({ variant: "ghost" })}
                    >
                      Disconnect MAL
                    </button>
                  </form>
                </>
              ) : null}
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Last sync: {formatDate(malAccount?.lastSyncedAt ?? null)}</p>
              {malAccount?.profile.picture ? (
                <img
                  src={String(malAccount.profile.picture)}
                  alt="MAL profile"
                  className="size-16 rounded-full border object-cover"
                />
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Run history</CardTitle>
              <CardDescription>
                Every provider sync records counts, warnings, and terminal
                status.
              </CardDescription>
            </div>
            {syncRuns.some((run) => run.status !== "running") ? (
              <form action={clearSyncHistoryAction}>
                <button
                  type="submit"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Clear completed runs
                </button>
              </form>
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
                            <form action={retryProviderRunItemAction}>
                              <input
                                type="hidden"
                                name="runId"
                                value={run.id}
                              />
                              <input
                                type="hidden"
                                name="itemId"
                                value={item.itemId}
                              />
                              <button
                                type="submit"
                                className={buttonVariants({
                                  variant: "outline",
                                  size: "sm",
                                })}
                              >
                                Re-sync
                              </button>
                            </form>
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
