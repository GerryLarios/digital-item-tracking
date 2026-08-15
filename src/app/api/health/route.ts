import { sqlite } from "@/lib/db/client"
import { isDetailSyncWorkerStarted } from "@/lib/sync/detail-worker"

export const runtime = "nodejs"

export async function GET() {
  const result = sqlite.prepare("select 1 as one").get() as { one: number } | undefined

  return Response.json({
    ok: result?.one === 1,
    detailWorkerStarted: isDetailSyncWorkerStarted(),
    timestamp: new Date().toISOString(),
  })
}
