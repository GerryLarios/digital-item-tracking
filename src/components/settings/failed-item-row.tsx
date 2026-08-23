import Link from "next/link";

import { prettyJson } from "@/lib/helpers";

import { RetryDetailSyncItemForm } from "./retry-detail-sync-item-form";

export function FailedItemRow({
  id,
  nodeId,
  displayName,
  message,
  responseJson,
}: {
  id: string;
  nodeId: string;
  displayName: string;
  message: string | null;
  responseJson: string | null;
}) {
  return (
    <li className="flex flex-wrap items-start gap-2">
      <Link className="font-medium underline" href={`/library/${nodeId}`}>
        {displayName}
      </Link>
      <span className="flex-1">: {message}</span>
      {prettyJson(responseJson) ? (
        <details className="w-full">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Raw provider response
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
            {prettyJson(responseJson)}
          </pre>
        </details>
      ) : null}
      <RetryDetailSyncItemForm itemId={id} />
    </li>
  );
}
