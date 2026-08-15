"use client"

import { useRef } from "react"

import { deleteNodeAction } from "@/app/actions/library"
import { Button } from "@/components/ui/button"

export function DeleteNodeButton({ nodeId, title }: { nodeId: string; title: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const confirmedRef = useRef<HTMLInputElement>(null)

  return (
    <form action={deleteNodeAction} ref={formRef}>
      <input type="hidden" name="nodeId" value={nodeId} />
      <input ref={confirmedRef} type="hidden" name="confirmed" value="false" />
      <Button
        type="button"
        variant="destructive"
        onClick={() => {
          if (window.confirm(`Delete “${title}”? This cannot be undone.`)) {
            if (confirmedRef.current) {
              confirmedRef.current.value = "true"
            }
            formRef.current?.requestSubmit()
          }
        }}
      >
        Delete item
      </Button>
    </form>
  )
}
