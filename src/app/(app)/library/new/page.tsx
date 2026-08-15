import { NodeEditorForm } from "@/components/library/node-editor-form"
import type { NodeEditorInput } from "@/lib/validation"

export const metadata = {
  title: "New item",
}

export const dynamic = "force-dynamic"

const emptyNode: NodeEditorInput = {
  id: undefined,
  displayName: "",
  mediaType: "GAME",
  status: "NOT_STARTED",
  description: undefined,
  releaseYear: undefined,
  nsfw: false,
  hidden: false,
  notes: undefined,
  removeImage: false,
  attributes: [],
  storageLocations: [],
  links: [],
}

export default function NewNodePage() {
  return (
    <NodeEditorForm
      initialData={emptyNode}
      heading="Create backlog item"
      description="Manual entries preserve local overrides and merge safely with provider syncs later."
    />
  )
}
