import { disconnectProviderAction, runSyncAction } from "@/app/actions/settings";
import { buttonVariants } from "@/components/ui/button";
import { PROVIDER_LABELS, type Provider } from "@/lib/constants";

import { StartDetailSyncForm } from "./start-detail-sync-form";

export function ProviderActions({
  provider,
  connected,
}: {
  provider: Provider;
  connected: boolean;
}) {
  const label = PROVIDER_LABELS[provider];
  return (
    <div className="flex flex-wrap gap-2">
      <form action={runSyncAction}>
        <input type="hidden" name="provider" value={provider} />
        <button
          type="submit"
          className={buttonVariants({ variant: "outline" })}
        >
          Run {label} sync now
        </button>
      </form>
      {connected ? (
        <>
          <StartDetailSyncForm
            provider={provider}
            label={`Run ${label} Item Details Sync`}
            variant="outline"
          />
          <form action={disconnectProviderAction}>
            <input type="hidden" name="provider" value={provider} />
            <button
              type="submit"
              className={buttonVariants({ variant: "ghost" })}
            >
              Disconnect {label}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
