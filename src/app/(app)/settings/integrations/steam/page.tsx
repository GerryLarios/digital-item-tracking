import { DetailSyncRefresh } from "@/components/settings/detail-sync-refresh";
import { ProviderActions } from "@/components/settings/provider-actions";
import { SteamSettingsForm } from "@/components/settings/steam-settings-form";
import { Badge } from "@/components/ui/badge";
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
  title: "Steam",
};

export const dynamic = "force-dynamic";

export default async function SteamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const notice = toIntegrationsNotice(params);
  const env = getEnv();
  const steamAccount = getSyncAccount("steam");
  const providerSync = getProviderSyncProgress();

  return (
    <div className="space-y-6">
      <DetailSyncRefresh active={providerSync.length > 0} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Steam</h1>
        <p className="text-sm text-muted-foreground">
          Owned games and wishlist entries use Steam&apos;s Web API. Profile and
          Game details visibility must allow wishlist access.
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
            Last sync: {formatDate(steamAccount?.lastSyncedAt ?? null)}
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
          <SteamSettingsForm
            steamId={String(steamAccount?.config.steamId ?? "")}
            hasWishlistUrl={Boolean(steamAccount?.accessToken)}
          />
          <ProviderActions
            provider="steam"
            connected={Boolean(steamAccount)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
