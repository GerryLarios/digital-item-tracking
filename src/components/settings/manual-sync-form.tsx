import { runSyncAction } from "@/app/actions/settings";
import { buttonVariants } from "@/components/ui/button";

export function ManualSyncForm() {
  return (
    <form action={runSyncAction}>
      <input type="hidden" name="provider" value="all" />
      <button
        type="submit"
        className={buttonVariants({ variant: "outline" })}
      >
        Sync all enabled providers now
      </button>
    </form>
  );
}
