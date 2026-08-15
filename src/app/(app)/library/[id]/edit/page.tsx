import { notFound } from "next/navigation"

import { NodeEditorForm } from "@/components/library/node-editor-form"
import { getNodeForEditing } from "@/lib/library/service"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const node = getNodeForEditing(id)

  return {
    title: node ? `Edit ${node.displayName}` : "Edit item",
  }
}

export default async function EditNodePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const node = getNodeForEditing(id)

  if (!node) {
    notFound()
  }

  return (
    <NodeEditorForm
      initialData={node}
      heading={`Edit ${node.displayName}`}
      description="Manual edits are locked so future syncs keep your local changes intact."
    />
  )
}
