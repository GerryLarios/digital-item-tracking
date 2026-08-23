import { startDetailSyncAction } from "@/app/actions/settings";
import { buttonVariants } from "@/components/ui/button";

export function StartDetailSyncForm({
  provider,
  label = "Sync all item details",
  variant = "default",
}: {
  provider?: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  return (
    <form action={startDetailSyncAction}>
      {provider ? (
        <input type="hidden" name="provider" value={provider} />
      ) : null}
      <button type="submit" className={buttonVariants({ variant })}>
        {label}
      </button>
    </form>
  );
}
