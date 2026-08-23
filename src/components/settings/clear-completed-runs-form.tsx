import { clearSyncHistoryAction } from "@/app/actions/settings";
import { buttonVariants } from "@/components/ui/button";

export function ClearCompletedRunsForm() {
  return (
    <form action={clearSyncHistoryAction}>
      <button
        type="submit"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        Clear completed runs
      </button>
    </form>
  );
}
