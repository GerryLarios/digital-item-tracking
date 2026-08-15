import type { AttributeValueType, MediaType, NodeStatus, Provider, StorageMedium } from "@/lib/constants"

export type RemoteAttribute = {
  key: string
  value: string
  valueType?: AttributeValueType
}

export type RemoteStorageLocation = {
  label: string
  medium: StorageMedium
  platform?: string | null
  notes?: string | null
}

export type RemoteCatalogItem = {
  provider: Provider
  externalId: string
  mediaType: MediaType
  title: string
  description?: string | null
  status?: NodeStatus | null
  releaseYear?: number | null
  nsfw?: boolean | null
  memberships: string[]
  externalUrl?: string | null
  imageUrl?: string | null
  remoteUpdatedAt?: Date | null
  remoteCreatedAt?: Date | null
  sourceData?: Record<string, unknown>
  attributes?: RemoteAttribute[]
  storageLocations?: RemoteStorageLocation[]
}

export type ProviderSyncResult = {
  items: RemoteCatalogItem[]
  warnings: string[]
  membershipSnapshots: Record<string, string[]>
  profile?: Record<string, unknown>
  externalAccountId?: string | null
  displayName?: string | null
}
