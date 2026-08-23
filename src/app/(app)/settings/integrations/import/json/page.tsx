import { buttonVariants } from "@/components/ui/button";
import { JsonImportForm } from "@/components/settings/json-import-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { toLibraryJsonImportNotice } from "../../notices";

export const metadata = {
  title: "Library data import",
};

export const dynamic = "force-dynamic";

export default async function LibraryJsonImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const notice = toLibraryJsonImportNotice(params);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import or export library data
        </h1>
        <p className="text-sm text-muted-foreground">
          JSON imports create or merge items. Artwork files and account
          credentials are not included.
        </p>
      </div>
      {notice ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${notice.error ? "border-destructive/50 text-destructive" : "bg-background"}`}
        >
          {notice.message}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Library JSON</CardTitle>
          <CardDescription>
            A full snapshot of your library as JSON. Re-importing a file merges
            by provider identity, so it is safe to run twice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <a
            href="/api/library/export"
            className={buttonVariants({ variant: "outline" })}
          >
            Export JSON
          </a>
          <JsonImportForm />
        </CardContent>
      </Card>
    </div>
  );
}
