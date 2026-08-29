import { retryProviderRunItemAction } from "@/app/actions/settings";
import { buttonVariants } from "@/components/ui/button";

export function RetryProviderRunItemForm({
  runId,
  itemId,
}: {
  runId: string;
  itemId: string;
}) {
  return (
    <form action={retryProviderRunItemAction}>
      <input type="hidden" name="runId" value={runId} />
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
