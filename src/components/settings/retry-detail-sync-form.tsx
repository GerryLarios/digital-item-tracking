import { retryDetailSyncAction } from "@/app/actions/settings";
import { buttonVariants } from "@/components/ui/button";

export function RetryDetailSyncForm({ jobId }: { jobId: string }) {
  return (
    <form action={retryDetailSyncAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <button type="submit" className={buttonVariants({ variant: "outline" })}>
        Retry failed items
      </button>
    </form>
  );
}
