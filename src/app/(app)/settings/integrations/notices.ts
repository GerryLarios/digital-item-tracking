import { PROVIDER_LABELS } from "@/lib/constants";

type SearchParams = Record<string, string | string[] | undefined>;

export function toIntegrationsNotice(params: SearchParams) {
  if (typeof params.saved === "string")
    return `${params.saved} settings saved.`;
  if (typeof params.synced === "string") {
    if (params.synced === "queued-all") return "Provider sync queued.";
    if (params.synced === "retrying")
      return "Failed item queued for re-sync.";
    if (params.synced.startsWith("queued-")) {
      const provider = params.synced.slice("queued-".length);
      return `${PROVIDER_LABELS[provider as keyof typeof PROVIDER_LABELS] ?? provider} sync queued.`;
    }
    return `${params.synced} sync completed.`;
  }
  if (typeof params.disconnected === "string")
    return `${PROVIDER_LABELS[params.disconnected as keyof typeof PROVIDER_LABELS] ?? params.disconnected} disconnected.`;
  if (typeof params.connected === "string")
    return `${PROVIDER_LABELS[params.connected as keyof typeof PROVIDER_LABELS] ?? params.connected} connected.`;
  if (params.details === "queued") return "Item detail sync queued.";
  if (params.details === "active")
    return "An item detail sync is already active.";
  if (params.details === "retrying")
    return "Failed item details queued for retry.";
  if (params.cleared === "history") return "Sync history cleared.";
  if (typeof params.error === "string")
    return decodeURIComponent(params.error);
  return null;
}

export function toLibraryJsonImportNotice(params: SearchParams) {
  if (typeof params.importError === "string") {
    return { error: true, message: params.importError };
  }
  if (
    typeof params.importCreated !== "string" ||
    typeof params.importMerged !== "string"
  ) {
    return null;
  }

  const artwork = Number(params.artworkSkipped ?? 0);
  return {
    error: false,
    message: `Import complete: ${Number(params.importCreated)} created, ${Number(params.importMerged)} merged.${artwork ? ` ${artwork} artwork records skipped because image files are not included.` : ""}`,
  };
}
