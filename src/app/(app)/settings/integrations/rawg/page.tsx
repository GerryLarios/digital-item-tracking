import { DetailSyncRefresh } from "@/components/settings/detail-sync-refresh";
import { StartDetailSyncForm } from "@/components/settings/start-detail-sync-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { getDetailSyncProgress } from "@/lib/sync/detail-queue";

export const metadata = {
  title: "RAWG",
};

export const dynamic = "force-dynamic";

export default async function RawgPage() {
  const env = getEnv();
  const detailSyncActive =
    getDetailSyncProgress()?.status === "queued" ||
    getDetailSyncProgress()?.status === "running";

  return (
    <div className="space-y-6">
      <DetailSyncRefresh active={detailSyncActive} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">RAWG</h1>
        <p className="text-sm text-muted-foreground">
          Adds game metadata and artwork during the JSON importer and item
          details refresh. Does not sync your library from RAWG.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>API key</CardTitle>
          <CardDescription>
            RAWG uses a single API key, set in your .env file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={env.rawgApiKey ? "secondary" : "destructive"}>
              API key {env.rawgApiKey ? "configured" : "missing"}
            </Badge>
          </div>
          {!env.rawgApiKey ? (
            <p className="text-muted-foreground">
              Add your key as <code>RAWG_API_KEY</code> to .env to enable game
              enrichment.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Fetch item details</CardTitle>
          <CardDescription>
            Refresh metadata and artwork, and populate the screenshot gallery
            for every game with a RAWG reference. Work continues in the
            background.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {detailSyncActive ? null : (
            <StartDetailSyncForm
              provider="rawg"
              label="Fetch Item Details for stored games"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
