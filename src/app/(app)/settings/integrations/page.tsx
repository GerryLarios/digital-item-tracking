import Link from "next/link";

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
import { getEnv } from "@/lib/env";
import { getSyncAccount } from "@/lib/integrations/service";
import { getDetailSyncProgress } from "@/lib/sync/detail-queue";
import { getProviderSyncProgress } from "@/lib/sync/provider-run";

export const metadata = {
  title: "Integrations",
};

export const dynamic = "force-dynamic";

const LINK_CARDS = [
  {
    href: "/settings/integrations/sync",
    title: "Manual sync",
    description:
      "Run provider syncs now and watch their progress, including failed items.",
  },
  {
    href: "/settings/integrations/details",
    title: "Item details",
    description:
      "Refresh details and artwork for every item with an active provider reference.",
  },
  {
    href: "/settings/integrations/steam",
    title: "Steam",
    description: "SteamID64, wishlist link, syncs, and disconnect.",
  },
  {
    href: "/settings/integrations/mal",
    title: "MyAnimeList",
    description: "OAuth connection, syncs, profile, and disconnect.",
  },
  {
    href: "/settings/integrations/history",
    title: "Run history",
    description:
      "Every provider sync with counts, warnings, and per-item re-syncs.",
  },
  {
    href: "/settings/integrations/import/json",
    title: "Library data",
    description: "Import or export your library as JSON.",
  },
  {
    href: "/settings/integrations/import/mal",
    title: "MyAnimeList XML import",
    description:
      "Import a MyAnimeList XML export with live progress and failure retries.",
  },
];

export default async function IntegrationsPage() {
  const env = getEnv();
  const steamAccount = getSyncAccount("steam");
  const malAccount = getSyncAccount("mal");
  const detailSyncActive =
    getDetailSyncProgress()?.status === "queued" ||
    getDetailSyncProgress()?.status === "running";
  const providerSyncActive = getProviderSyncProgress().length > 0;

  return (
    <div className="space-y-6">
      <DetailSyncRefresh active={detailSyncActive || providerSyncActive} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Integrations &amp; sync
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure provider connectivity, run manual syncs, and review their
          history.
        </p>
      </div>
      {(detailSyncActive || providerSyncActive) && (
        <div className="rounded-lg border bg-background px-4 py-3 text-sm">
          A sync is currently running — see{" "}
          <Link
            href="/settings/integrations/sync"
            className="font-medium underline"
          >
            Manual sync
          </Link>{" "}
          for live progress.
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>Provider connectivity at a glance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 font-medium">Steam</span>
              <Badge variant={env.steamApiKey ? "secondary" : "destructive"}>
                API key {env.steamApiKey ? "configured" : "missing"}
              </Badge>
              {steamAccount ? (
                <Badge variant="outline">connected</Badge>
              ) : (
                <Badge variant="outline">not connected</Badge>
              )}
              <Link
                href="/settings/integrations/steam"
                className="ml-auto text-muted-foreground underline-offset-4 hover:underline"
              >
                Manage
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 font-medium">MyAnimeList</span>
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
              {malAccount ? (
                <Badge variant="outline">connected</Badge>
              ) : (
                <Badge variant="outline">not connected</Badge>
              )}
              <Link
                href="/settings/integrations/mal"
                className="ml-auto text-muted-foreground underline-offset-4 hover:underline"
              >
                Manage
              </Link>
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-1">
          {LINK_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl border bg-background p-4 transition-colors hover:bg-muted/50"
            >
              <p className="font-medium">{card.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {card.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Link href="/library" className={buttonVariants({ variant: "ghost" })}>
          Back to library
        </Link>
      </div>
    </div>
  );
}
