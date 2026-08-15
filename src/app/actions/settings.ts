"use server"

import { redirect } from "next/navigation"

import { getPrimaryUserId, requireSession } from "@/lib/auth"
import { PROVIDERS } from "@/lib/constants"
import { configureSteamAccount, disconnectProvider } from "@/lib/integrations/service"
import { steamConfigSchema } from "@/lib/validation"
import { enqueueDetailSync, retryFailedDetailSync } from "@/lib/sync/detail-queue"
import { syncAllProviders, syncProvider } from "@/lib/sync/service"

export async function updateSteamSettingsAction(formData: FormData) {
  await requireSession()

  const parsed = steamConfigSchema.safeParse({
    steamId: formData.get("steamId"),
    wishlistShareUrl: formData.get("wishlistShareUrl"),
  })

  if (!parsed.success) {
    redirect("/settings/integrations?error=steam-config")
  }

  configureSteamAccount({
    steamId: parsed.data.steamId || null,
    wishlistShareUrl: parsed.data.wishlistShareUrl || undefined,
    enabled: true,
    userId: getPrimaryUserId(),
  })

  redirect("/settings/integrations?saved=steam")
}

export async function disconnectProviderAction(formData: FormData) {
  await requireSession()

  const provider = formData.get("provider")
  if (typeof provider !== "string" || !PROVIDERS.includes(provider as never)) {
    redirect("/settings/integrations")
  }

  disconnectProvider(provider as (typeof PROVIDERS)[number])
  redirect(`/settings/integrations?disconnected=${provider}`)
}

export async function runSyncAction(formData: FormData) {
  await requireSession()

  const provider = formData.get("provider")

  if (provider === "all") {
    await syncAllProviders("manual")
    redirect("/settings/integrations?synced=all")
  }

  if (typeof provider !== "string" || !PROVIDERS.includes(provider as never)) {
    redirect("/settings/integrations?error=sync-provider")
  }

  try {
    await syncProvider(provider as (typeof PROVIDERS)[number], "manual")
    redirect(`/settings/integrations?synced=${provider}`)
  } catch (error) {
    const message = error instanceof Error ? encodeURIComponent(error.message) : "sync-error"
    redirect(`/settings/integrations?error=${message}`)
  }
}

export async function startDetailSyncAction() {
  await requireSession()

  let created: boolean
  try {
    created = enqueueDetailSync().created
  } catch (error) {
    const message = error instanceof Error ? encodeURIComponent(error.message) : "detail-sync-error"
    redirect(`/settings/integrations?error=${message}`)
  }

  redirect(`/settings/integrations?details=${created ? "queued" : "active"}`)
}

export async function retryDetailSyncAction(formData: FormData) {
  await requireSession()

  const jobId = formData.get("jobId")
  if (typeof jobId !== "string" || !jobId) {
    redirect("/settings/integrations?error=Invalid%20detail%20sync%20job.")
  }

  try {
    retryFailedDetailSync(jobId)
  } catch (error) {
    const message = error instanceof Error ? encodeURIComponent(error.message) : "detail-sync-error"
    redirect(`/settings/integrations?error=${message}`)
  }

  redirect("/settings/integrations?details=retrying")
}
