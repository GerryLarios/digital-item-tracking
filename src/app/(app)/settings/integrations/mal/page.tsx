/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import { DetailSyncRefresh } from "@/components/settings/detail-sync-refresh";
import { ProviderActions } from "@/components/settings/provider-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { formatDate } from "@/lib/helpers";
import { getSyncAccount } from "@/lib/integrations/service";
import { getProviderSyncProgress } from "@/lib/sync/provider-run";

import { toIntegrationsNotice } from "../notices";

export const metadata = {
  title: "MyAnimeList",
};

export const dynamic = "force-dynamic";

export default async function MyAnimeListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const notice = toIntegrationsNotice(params);
  const env = getEnv();
  const malAccount = getSyncAccount("mal");
  const providerSync = getProviderSyncProgress();

  return (
    <div className="space-y-6">
      <DetailSyncRefresh active={providerSync.length > 0} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">MyAnimeList</h1>
        <p className="text-sm text-muted-foreground">
          OAuth stores encrypted access and refresh tokens, imports list
          statuses, favorites, profile metadata, and cached artwork.
        </p>
      </div>
      {notice ? (
        <div className="rounded-lg border bg-background px-4 py-3 text-sm">
          {notice}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Last sync: {formatDate(malAccount?.lastSyncedAt ?? null)}
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
              {env.malClientId && env.malClientSecret ? "configured" : "missing"}
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
          </div>
          {malAccount?.profile.picture ? (
            <img
              src={String(malAccount.profile.picture)}
              alt="MAL profile"
              className="size-16 rounded-full border object-cover"
            />
          ) : null}
          <ProviderActions provider="mal" connected={Boolean(malAccount)} />
        </CardContent>
      </Card>
    </div>
  );
}
