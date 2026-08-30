"use client"

import { useRef, useState } from "react"

import { mergeNodesAction } from "@/app/actions/library"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function MergeNodeForm({ targetId, title }: { targetId: string; title: string }) {
  const [source, setSource] = useState("")
  const confirmedRef = useRef<HTMLInputElement>(null)

  return (
    <form action={mergeNodesAction} className="space-y-3">
      <input type="hidden" name="targetId" value={targetId} />
      <div className="space-y-2">
        <Label htmlFor="merge-source">
          From the duplicate, paste its URL or ID (this item is kept)
        </Label>
        <Input
          id="merge-source"
          name="source"
          placeholder="e.g. localhost:3000/library/ffd52105-42a9-..."
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          ref={confirmedRef}
          type="checkbox"
          name="confirmed"
          value="true"
        />
        Permanently delete the other item after merging
      </label>
      <Button
        type="button"
        variant="destructive"
        disabled={!source.trim()}
        onClick={() => {
          if (!window.confirm(`Merge the other item into “${title}” and delete it?`)) {
            if (confirmedRef.current) confirmedRef.current.checked = false
            return
          }
          confirmedRef.current?.setAttribute("checked", "checked")
          confirmedRef.current?.form?.requestSubmit()
        }}
      >
        Merge items
      </Button>
    </form>
  )
}