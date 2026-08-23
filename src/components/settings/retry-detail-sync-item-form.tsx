import { retryDetailSyncItemAction } from "@/app/actions/settings";
import { buttonVariants } from "@/components/ui/button";

export function RetryDetailSyncItemForm({ itemId }: { itemId: string }) {
  return (
    <form action={retryDetailSyncItemAction}>
      <input type="hidden" name="itemId" value={itemId} />
      <button
        type="submit"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Re-sync
      </button>
    </form>
  );
}
