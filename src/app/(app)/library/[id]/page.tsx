/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";

import { findProviderMatchAction, syncNodeDetailsAction } from "@/app/actions/library";
import { DeleteNodeButton } from "@/components/library/delete-node-button";
import { MergeNodeForm } from "@/components/library/merge-node-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDate, parseJson } from "@/lib/helpers";
import { getNodeById } from "@/lib/library/service";
import { PROVIDER_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function groupAttributes(attributes: Array<{ key: string; value: string }>) {
  const groups = new Map<string, string[]>();

  for (const attribute of attributes) {
    const values = groups.get(attribute.key) ?? [];
    values.push(attribute.value);
    groups.set(attribute.key, values);
  }

  return [...groups.entries()];
}

function formatAttributeKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const node = getNodeById(id);

  return {
    title: node?.displayName ?? "Item detail",
  };
}

export default async function NodeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const node = getNodeById(id);

  if (!node) {
    notFound();
  }

  const mainImage = node.images.find((image) => image.role === "main");
  const galleryImages = node.images.filter(
    (image) => image.role === "gallery" && image.path.includes("/originals/"),
  );
  const groupedAttributes = groupAttributes(node.attributes);
  const syncNotice =
    typeof query.sync === "string"
      ? query.sync
      : typeof query.syncError === "string"
        ? query.syncError
        : null;
  const hasSyncError = typeof query.syncError === "string";
  const canSyncDetails = node.externalRefs.some((ref) => ref.isActive);
  const rawgRef = node.externalRefs.find((ref) => ref.provider === "rawg");

  return (
    <div className="space-y-6">
      {syncNotice ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            hasSyncError
              ? "border-destructive/50 text-destructive"
              : "bg-background"
          }`}
        >
          {syncNotice}
        </div>
      ) : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {node.displayName}
            </h1>
            <Badge variant="secondary">
              {node.mediaType.replaceAll("_", " ")}
            </Badge>
            <Badge>{node.status.replaceAll("_", " ")}</Badge>
            {node.hidden ? <Badge variant="outline">Hidden</Badge> : null}
            {node.nsfw ? <Badge variant="destructive">NSFW</Badge> : null}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {node.description || "No description saved for this item yet."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {node.mediaType === "GAME" ? (
            <form action={findProviderMatchAction}>
              <input type="hidden" name="nodeId" value={node.id} />
              <button type="submit" className={buttonVariants({ variant: "outline" })}>
                Find metadata
              </button>
            </form>
          ) : null}
          {canSyncDetails ? (
            <form action={syncNodeDetailsAction}>
              <input type="hidden" name="nodeId" value={node.id} />
              <button type="submit" className={buttonVariants()}>
                Sync details
              </button>
            </form>
          ) : null}
          <Link
            href={`/library/${node.id}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            Edit
          </Link>
          <DeleteNodeButton nodeId={node.id} title={node.displayName} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,360px)_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Artwork</CardTitle>
            <CardDescription>
              {mainImage?.sourceProvider
                ? `Synced from ${PROVIDER_LABELS[mainImage.sourceProvider]}.`
                : mainImage
                  ? "Uploaded manually."
                  : "No artwork has been added yet."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mainImage ? (
              <img
                src={`/media/${mainImage.id}`}
                alt={node.displayName}
                className="w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center rounded-xl bg-muted px-6 text-center text-sm text-muted-foreground">
                Add artwork by editing this item.
              </div>
            )}
            {galleryImages.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Screenshots</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {galleryImages.map((image) => (
                    <img
                      key={image.id}
                      src={`/media/${image.id}`}
                      alt={`${node.displayName} screenshot`}
                      className="aspect-video w-full rounded-lg object-cover"
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div>Updated {formatDate(node.updatedAt)}</div>
              <div>Created {formatDate(node.createdAt)}</div>
              {node.releaseYear ? <div>Released {node.releaseYear}</div> : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Ownership & sync</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                {node.storageLocations.length ? (
                  node.storageLocations.map((location) => (
                    <div key={location.id} className="rounded-lg border p-3">
                      <p className="font-medium">{location.label}</p>
                      <p className="text-muted-foreground">
                        {location.medium.replaceAll("_", " ")}
                        {location.platform ? ` · ${location.platform}` : ""}
                      </p>
                      {location.notes ? (
                        <p className="mt-2 text-muted-foreground">
                          {location.notes}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">
                    No ownership locations recorded.
                  </p>
                )}
              </div>
              <Separator />
              {rawgRef ? (
                <div className="rounded-lg border p-3">
                  <p className="font-medium">RAWG ID</p>
                  <p className="text-muted-foreground">
                    {rawgRef.externalId}
                    {rawgRef.externalUrl ? (
                      <Link
                        href={rawgRef.externalUrl}
                        className="ml-2 text-primary underline-offset-4 hover:underline"
                      >
                        Open on RAWG
                      </Link>
                    ) : null}
                  </p>
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                {node.externalRefs.length ? (
                  node.externalRefs.map((ref) => {
                    const memberships = parseJson<string[]>(
                      ref.listMemberships,
                      [],
                    );
                    return (
                      <div key={ref.id} className="rounded-lg border p-3">
                        <p className="font-medium">
                          {ref.provider.toUpperCase()}
                        </p>
                        <p className="text-muted-foreground">
                          ID {ref.externalId}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {memberships.map((membership) => (
                            <Badge
                              key={`${ref.id}-${membership}`}
                              variant="outline"
                            >
                              {membership}
                            </Badge>
                          ))}
                        </div>
                        {ref.externalUrl ? (
                          <Link
                            href={ref.externalUrl}
                            className="mt-2 inline-block text-primary underline-offset-4 hover:underline"
                          >
                            Open provider page
                          </Link>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-muted-foreground">
                    This entry does not have any synced provider identity yet.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {groupedAttributes.length ? (
                groupedAttributes.map(([key, values]) => (
                  <div key={key} className="rounded-lg border p-3">
                    <p className="font-medium">{formatAttributeKey(key)}</p>
                    <p className="mt-1 text-muted-foreground">
                      {values.join(", ")}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">
                  No extra metadata recorded.
                </p>
              )}
              {node.notes ? (
                <div className="rounded-lg border p-3">
                  <p className="font-medium">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {node.notes}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {node.links.length ? (
                node.links.map((link) => (
                  <div key={link.id} className="rounded-lg border p-3">
                    <p className="font-medium">{link.label}</p>
                    <Link
                      href={link.url}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {link.url}
                    </Link>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">
                  No manual links recorded.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Merge duplicate</CardTitle>
              <CardDescription>
                If this item exists a second time under another provider, merge
                them so one entry keeps every reference, attribute, and piece
                of artwork.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MergeNodeForm targetId={node.id} title={node.displayName} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
