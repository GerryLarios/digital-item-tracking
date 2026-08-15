"use client"

import { useActionState, useMemo, useState } from "react"

import { saveNodeAction } from "@/app/actions/library"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ATTRIBUTE_VALUE_TYPES, MEDIA_TYPES, NODE_STATUSES, STORAGE_MEDIA } from "@/lib/constants"
import type {
  NodeAttributeInput,
  NodeEditorInput,
  NodeLinkInput,
  StorageLocationInput,
} from "@/lib/validation"
import { EMPTY_FORM_STATE } from "@/lib/validation"

function sanitizeAttributes(items: NodeAttributeInput[]) {
  return items.filter((item) => item.key.trim() || item.value.trim())
}

function sanitizeLocations(items: StorageLocationInput[]) {
  return items.filter((item) => item.label.trim())
}

function sanitizeLinks(items: NodeLinkInput[]) {
  return items.filter((item) => item.label.trim() || item.url.trim())
}

export function NodeEditorForm({
  initialData,
  heading,
  description,
}: {
  initialData: NodeEditorInput
  heading: string
  description: string
}) {
  const [state, formAction, pending] = useActionState(saveNodeAction, EMPTY_FORM_STATE)
  const [attributes, setAttributes] = useState<NodeAttributeInput[]>(
    initialData.attributes.length ? initialData.attributes : [{ key: "", value: "", valueType: "text" }],
  )
  const [locations, setLocations] = useState<StorageLocationInput[]>(
    initialData.storageLocations.length
      ? initialData.storageLocations
      : [{ label: "", medium: "physical", platform: "", notes: "" }],
  )
  const [links, setLinks] = useState<NodeLinkInput[]>(
    initialData.links.length ? initialData.links : [{ label: "", url: "" }],
  )

  const attributesJson = useMemo(() => JSON.stringify(sanitizeAttributes(attributes)), [attributes])
  const locationsJson = useMemo(() => JSON.stringify(sanitizeLocations(locations)), [locations])
  const linksJson = useMemo(() => JSON.stringify(sanitizeLinks(links)), [links])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-8">
          <input type="hidden" name="id" value={initialData.id ?? ""} />
          <input type="hidden" name="attributesJson" value={attributesJson} />
          <input type="hidden" name="storageLocationsJson" value={locationsJson} />
          <input type="hidden" name="linksJson" value={linksJson} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="displayName">Title</Label>
              <Input id="displayName" name="displayName" defaultValue={initialData.displayName} required />
              {state.errors?.displayName ? (
                <p className="text-sm text-destructive">{state.errors.displayName[0]}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mediaType">Media type</Label>
              <select
                id="mediaType"
                name="mediaType"
                defaultValue={initialData.mediaType}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                {MEDIA_TYPES.map((mediaType) => (
                  <option key={mediaType} value={mediaType}>
                    {mediaType.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={initialData.status}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                {NODE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="releaseYear">Release year</Label>
              <Input id="releaseYear" name="releaseYear" defaultValue={initialData.releaseYear ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image">Main image</Label>
              <Input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp,image/avif" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" defaultValue={initialData.description ?? ""} rows={5} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={initialData.notes ?? ""} rows={4} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="nsfw" defaultChecked={initialData.nsfw} />
              Mark as NSFW
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="hidden" defaultChecked={initialData.hidden} />
              Hide from default library view
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" name="removeImage" defaultChecked={initialData.removeImage} />
              Remove the current stored image
            </label>
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">Attributes</h2>
                <p className="text-sm text-muted-foreground">Genres, developers, themes, aliases, and more.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAttributes((current) => [...current, { key: "", value: "", valueType: "text" }])}
              >
                Add attribute
              </Button>
            </div>
            <div className="space-y-3">
              {attributes.map((attribute, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_180px_auto]">
                  <Input
                    value={attribute.key}
                    onChange={(event) =>
                      setAttributes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))
                    }
                    placeholder="Key"
                  />
                  <Input
                    value={attribute.value}
                    onChange={(event) =>
                      setAttributes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))
                    }
                    placeholder="Value"
                  />
                  <select
                    className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                    value={attribute.valueType}
                    onChange={(event) =>
                      setAttributes((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, valueType: event.target.value as NodeAttributeInput["valueType"] } : item))
                    }
                  >
                    {ATTRIBUTE_VALUE_TYPES.map((valueType) => (
                      <option key={valueType} value={valueType}>
                        {valueType}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="ghost" onClick={() => setAttributes((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">Ownership & storage</h2>
                <p className="text-sm text-muted-foreground">Track physical shelves, digital storefronts, and cloud libraries.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocations((current) => [...current, { label: "", medium: "physical", platform: "", notes: "" }])}
              >
                Add location
              </Button>
            </div>
            <div className="space-y-3">
              {locations.map((location, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_180px_1fr_1fr_auto]">
                  <Input
                    value={location.label}
                    onChange={(event) =>
                      setLocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))
                    }
                    placeholder="Label"
                  />
                  <select
                    className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                    value={location.medium}
                    onChange={(event) =>
                      setLocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, medium: event.target.value as StorageLocationInput["medium"] } : item))
                    }
                  >
                    {STORAGE_MEDIA.map((medium) => (
                      <option key={medium} value={medium}>
                        {medium.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={location.platform ?? ""}
                    onChange={(event) =>
                      setLocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, platform: event.target.value } : item))
                    }
                    placeholder="Platform"
                  />
                  <Input
                    value={location.notes ?? ""}
                    onChange={(event) =>
                      setLocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item))
                    }
                    placeholder="Notes"
                  />
                  <Button type="button" variant="ghost" onClick={() => setLocations((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">External links</h2>
                <p className="text-sm text-muted-foreground">Manual links that should stay attached to this entry.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLinks((current) => [...current, { label: "", url: "" }])}
              >
                Add link
              </Button>
            </div>
            <div className="space-y-3">
              {links.map((link, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[200px_1fr_auto]">
                  <Input
                    value={link.label}
                    onChange={(event) =>
                      setLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))
                    }
                    placeholder="Label"
                  />
                  <Input
                    value={link.url}
                    onChange={(event) =>
                      setLinks((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))
                    }
                    placeholder="https://example.com"
                  />
                  <Button type="button" variant="ghost" onClick={() => setLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {state.message ? <p className="text-sm text-destructive">{state.message}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save item"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
