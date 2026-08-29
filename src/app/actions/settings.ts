"use server";

import { redirect } from "next/navigation";

import { getPrimaryUserId, requireSession } from "@/lib/auth";
import { PROVIDERS } from "@/lib/constants";
import {
  configureSteamAccount,
  disconnectProvider,
} from "@/lib/integrations/service";
import {
  enqueueDetailSync,
  retryDetailSyncItem,
  retryFailedDetailSync,
} from "@/lib/sync/detail-queue";
import {
  enqueueAllProviderSyncs,
  enqueueProviderSync,
  retryProviderRunItem,
} from "@/lib/sync/provider-run";
import { clearCompletedSyncRuns } from "@/lib/sync/service";
import { steamConfigSchema } from "@/lib/validation";

export async function updateSteamSettingsAction(formData: FormData) {
  await requireSession();

  const parsed = steamConfigSchema.safeParse({
    steamId: formData.get("steamId"),
    wishlistShareUrl: formData.get("wishlistShareUrl"),
  });

  if (!parsed.success) {
    redirect("/settings/integrations/steam?error=steam-config");
  }

  configureSteamAccount({
    steamId: parsed.data.steamId || null,
    wishlistShareUrl: parsed.data.wishlistShareUrl || undefined,
    enabled: true,
    userId: getPrimaryUserId(),
  });

  redirect("/settings/integrations/steam?saved=steam");
}

export async function disconnectProviderAction(formData: FormData) {
  await requireSession();

  const provider = formData.get("provider");
  if (typeof provider !== "string" || !PROVIDERS.includes(provider as never)) {
    redirect("/settings/integrations");
  }

  disconnectProvider(provider as (typeof PROVIDERS)[number]);
  redirect(`/settings/integrations/${provider}?disconnected=${provider}`);
}

export async function runSyncAction(formData: FormData) {
  await requireSession();

  const provider = formData.get("provider");

  if (provider === "all") {
    enqueueAllProviderSyncs("manual");
    redirect("/settings/integrations/sync?synced=queued-all");
  }

  if (typeof provider !== "string" || !PROVIDERS.includes(provider as never)) {
    redirect("/settings/integrations/sync?error=sync-provider");
  }

  try {
    enqueueProviderSync(provider as (typeof PROVIDERS)[number], "manual");
  } catch (error) {
    const message =
      error instanceof Error ? encodeURIComponent(error.message) : "sync-error";
    redirect(`/settings/integrations/sync?error=${message}`);
  }

  redirect(`/settings/integrations/sync?synced=queued-${provider}`);
}

export async function startDetailSyncAction(formData: FormData) {
  await requireSession();

  const rawProvider = formData.get("provider");
  const provider =
    typeof rawProvider === "string" &&
    PROVIDERS.includes(rawProvider as never)
      ? (rawProvider as (typeof PROVIDERS)[number])
      : undefined;

  let created: boolean;
  try {
    created = enqueueDetailSync(provider).created;
  } catch (error) {
    const message =
      error instanceof Error
        ? encodeURIComponent(error.message)
        : "detail-sync-error";
    redirect(`/settings/integrations/details?error=${message}`);
  }

  redirect(
    `/settings/integrations/details?details=${created ? "queued" : "active"}`,
  );
}

export async function retryDetailSyncAction(formData: FormData) {
  await requireSession();

  const jobId = formData.get("jobId");
  if (typeof jobId !== "string" || !jobId) {
    redirect("/settings/integrations/details?error=Invalid%20detail%20sync%20job.");
  }

  try {
    retryFailedDetailSync(jobId);
  } catch (error) {
    const message =
      error instanceof Error
        ? encodeURIComponent(error.message)
        : "detail-sync-error";
    redirect(`/settings/integrations/details?error=${message}`);
  }

  redirect("/settings/integrations/details?details=retrying");
}

export async function retryDetailSyncItemAction(formData: FormData) {
  await requireSession();

  const itemId = formData.get("itemId");
  if (typeof itemId !== "string" || !itemId) {
    redirect("/settings/integrations/details?error=Invalid%20detail%20sync%20item.");
  }

  try {
    retryDetailSyncItem(itemId);
  } catch (error) {
    const message =
      error instanceof Error
        ? encodeURIComponent(error.message)
        : "detail-sync-error";
    redirect(`/settings/integrations/details?error=${message}`);
  }

  redirect("/settings/integrations/details?details=retrying");
}

export async function retryProviderRunItemAction(formData: FormData) {
  await requireSession();

  const runId = formData.get("runId");
  const itemId = formData.get("itemId");
  if (
    typeof runId !== "string" ||
    !runId ||
    typeof itemId !== "string" ||
    !itemId
  ) {
    redirect(
      "/settings/integrations/sync?error=Invalid%20sync%20item.",
    );
  }

  try {
    retryProviderRunItem(runId, itemId);
  } catch (error) {
    const message =
      error instanceof Error
        ? encodeURIComponent(error.message)
        : "provider-sync-error";
    redirect(`/settings/integrations/sync?error=${message}`);
  }

  redirect("/settings/integrations/sync?synced=retrying");
}

export async function clearSyncHistoryAction() {
  await requireSession();

  clearCompletedSyncRuns();
  redirect("/settings/integrations/history?cleared=history");
}
