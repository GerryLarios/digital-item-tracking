import Link from "next/link";

import { MalFailuresList } from "@/components/settings/mal-failures-list";
import { MalImportForm } from "@/components/settings/mal-import-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSyncAccount } from "@/lib/integrations/service";
import { getMalImportFailures } from "@/lib/library/mal-import";

export const metadata = {
  title: "MyAnimeList XML import",
};

export const dynamic = "force-dynamic";

export default async function MyAnimeListImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const importError =
    typeof params.importError === "string"
      ? decodeURIComponent(params.importError)
      : null;
  const malAccount = getSyncAccount("mal");
  const malFailures = getMalImportFailures();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import MyAnimeList XML
        </h1>
        <p className="text-sm text-muted-foreground">
          Imports a MyAnimeList anime export. Each entry&apos;s details are
          fetched from the API (requires a connected account) and a live
          progress page is shown while it runs.
        </p>
      </div>
      {importError ? (
        <div className="rounded-lg border border-destructive/50 px-4 py-3 text-sm text-destructive">
          {importError}
        </div>
      ) : null}
      {!malAccount ? (
        <div className="rounded-lg border border-destructive/50 bg-background px-4 py-3 text-sm text-destructive">
          Connect MyAnimeList on the{" "}
          <Link href="/settings/integrations/mal" className="underline">
            MyAnimeList page
          </Link>{" "}
          before importing its XML export.
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>XML export</CardTitle>
          <CardDescription>
            Only the anime IDs and list statuses are read; everything else comes
            from the MyAnimeList API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <MalImportForm />
          <MalFailuresList failures={malFailures} />
        </CardContent>
      </Card>
    </div>
  );
}
