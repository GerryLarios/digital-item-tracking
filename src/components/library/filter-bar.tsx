"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { MEDIA_TYPES, NODE_STATUSES, PROVIDERS, STORAGE_MEDIA } from "@/lib/constants"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function LibraryFilterBar({
  total,
  initialQuery,
}: {
  total: number
  initialQuery: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(initialQuery)

  const currentView = searchParams.get("view") ?? "grid"

  const applyParams = (updater: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString())
    updater(params)
    params.delete("page")
    router.replace(`${pathname}?${params.toString()}`)
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      applyParams((params) => {
        if (query) {
          params.set("q", query)
        } else {
          params.delete("q")
        }
      })
    }, 300)

    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const queryStringWithoutView = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("view")
    return params.toString()
  }, [searchParams])

  return (
    <div className="space-y-4 rounded-xl border bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">{total} tracked items across manual and synced sources.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/library?${queryStringWithoutView}${queryStringWithoutView ? "&" : ""}view=grid`}
            className={buttonVariants({
              variant: currentView === "grid" ? "default" : "outline",
              size: "sm",
            })}
          >
            Grid
          </Link>
          <Link
            href={`/library?${queryStringWithoutView}${queryStringWithoutView ? "&" : ""}view=list`}
            className={buttonVariants({
              variant: currentView === "list" ? "default" : "outline",
              size: "sm",
            })}
          >
            List
          </Link>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-7">
        <div className="xl:col-span-2">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or synopsis" />
        </div>
        <select
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          defaultValue={searchParams.get("mediaType") ?? ""}
          onChange={(event) =>
            applyParams((params) => {
              if (event.target.value) params.set("mediaType", event.target.value)
              else params.delete("mediaType")
            })
          }
        >
          <option value="">All media</option>
          {MEDIA_TYPES.map((mediaType) => (
            <option key={mediaType} value={mediaType}>
              {mediaType.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          defaultValue={searchParams.get("collection") ?? ""}
          onChange={(event) =>
            applyParams((params) => {
              if (event.target.value) params.set("collection", event.target.value)
              else params.delete("collection")
            })
          }
        >
          <option value="">All collections</option>
          <option value="wishlist">Steam wishlist</option>
          <option value="owned">Steam owned</option>
          <option value="favorite">MAL favorites</option>
          <option value="list">MAL list</option>
        </select>
        <select
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          defaultValue={searchParams.get("status") ?? ""}
          onChange={(event) =>
            applyParams((params) => {
              if (event.target.value) params.set("status", event.target.value)
              else params.delete("status")
            })
          }
        >
          <option value="">All statuses</option>
          {NODE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          defaultValue={searchParams.get("provider") ?? ""}
          onChange={(event) =>
            applyParams((params) => {
              if (event.target.value) params.set("provider", event.target.value)
              else params.delete("provider")
            })
          }
        >
          <option value="">All providers</option>
          {PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {provider.toUpperCase()}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          defaultValue={searchParams.get("medium") ?? ""}
          onChange={(event) =>
            applyParams((params) => {
              if (event.target.value) params.set("medium", event.target.value)
              else params.delete("medium")
            })
          }
        >
          <option value="">All ownership</option>
          {STORAGE_MEDIA.map((medium) => (
            <option key={medium} value={medium}>
              {medium.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            defaultChecked={searchParams.get("showHidden") === "true"}
            onChange={(event) =>
              applyParams((params) => {
                if (event.target.checked) params.set("showHidden", "true")
                else params.delete("showHidden")
              })
            }
          />
          Show hidden items
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            defaultChecked={searchParams.get("showNsfw") === "true"}
            onChange={(event) =>
              applyParams((params) => {
                if (event.target.checked) params.set("showNsfw", "true")
                else params.delete("showNsfw")
              })
            }
          />
          Show NSFW items
        </label>
      </div>
    </div>
  )
}
