/* eslint-disable @next/next/no-img-element */

import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export function NodeCard({
  item,
}: {
  item: {
    id: string
    displayName: string
    mediaType: string
    status: string
    description: string | null
    providers: string[]
    mainImageId: string | null
    thumbnailImageId: string | null
  }
}) {
  const imageId = item.thumbnailImageId ?? item.mainImageId

  return (
    <Card className="overflow-hidden">
      {imageId ? (
        <img
          src={`/media/${imageId}`}
          alt={item.displayName}
          className="aspect-[3/2] w-full object-cover"
        />
      ) : (
        <div className="aspect-[3/2] bg-muted" />
      )}
      <CardHeader>
        <CardTitle className="line-clamp-1">{item.displayName}</CardTitle>
        <CardDescription>
          {item.mediaType.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="line-clamp-3 text-sm text-muted-foreground">
          {item.description || "No description yet."}
        </p>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {item.providers.map((provider) => (
            <Badge key={provider} variant="secondary">
              {provider.toUpperCase()}
            </Badge>
          ))}
        </div>
        <Link href={`/library/${item.id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Open
        </Link>
      </CardFooter>
    </Card>
  )
}
