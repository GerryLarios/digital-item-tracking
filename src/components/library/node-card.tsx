/* eslint-disable @next/next/no-img-element */

import { ArrowUpRight } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"

export function NodeCard({
  item,
}: {
  item: {
    id: string
    displayName: string
    mediaType: string
    status: string
    description: string | null
    releaseYear: number | null
    isWishlisted: boolean
    nsfw: boolean
    providers: string[]
    mainImageId: string | null
    thumbnailImageId: string | null
  }
}) {
  const imageId = item.thumbnailImageId ?? item.mainImageId

  return (
    <article className="group flex gap-5 py-5 first:pt-0 last:pb-0 sm:gap-7">
      <div className="relative aspect-[4/3] w-40 shrink-0 overflow-hidden rounded-xl bg-muted">
        {imageId ? (
          <img
            alt={item.displayName}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            src={`/media/${imageId}`}
          />
        ) : null}
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {item.isWishlisted ? (
            <Badge className="text-[10px]">Wishlist</Badge>
          ) : null}
          {item.nsfw ? (
            <Badge variant="destructive" className="text-[10px]">
              NSFW
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 sm:flex-row sm:gap-6">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.16em] text-primary">
              {item.mediaType.replaceAll("_", " ")}
            </span>
          </div>
          <h2 className="line-clamp-1 break-words text-xl leading-tight tracking-tight text-foreground sm:text-2xl">
            {item.displayName}
          </h2>
          <p className="mt-2 line-clamp-2 max-w-xl break-words text-sm leading-6 text-muted-foreground">
            {item.description || "No description yet."}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{item.status.replaceAll("_", " ")}</span>
            {item.releaseYear ? <span>{item.releaseYear}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-end justify-between gap-4 sm:flex-col sm:items-end">
          <div className="flex flex-wrap gap-1">
            {item.providers.map((provider) => (
              <Badge key={provider} variant="secondary">
                {provider.toUpperCase()}
              </Badge>
            ))}
          </div>
          <Link
            href={`/library/${item.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            View item <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  )
}
