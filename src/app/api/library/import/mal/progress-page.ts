import type { MalXmlImportProgress } from "@/lib/library/mal-import"

const PAGE_STYLES = `
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; }
    .progress { font-variant-numeric: tabular-nums; color: #555; }
    .error { color: #dc2626; }
`

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      default:
        return "&#39;"
    }
  })
}

// ponytail: streamed plain HTML relies on the server not buffering; if a
// reverse proxy swallows the live updates, swap for a job table + polling.
export function progressPageResponse(
  run: (send: (chunk: string) => void) => Promise<void>,
) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk))
      try {
        send(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MyAnimeList import</title><style>${PAGE_STYLES}</style></head><body>
<h1>Importing MyAnimeList export&hellip;</h1>
<p>Fetching details from MyAnimeList for each entry. Large lists take a while &mdash; this page updates as items are processed.</p>`,
        )
        await run(send)
      } catch (error) {
        console.error("MyAnimeList XML import failed", error)
        const message =
          error instanceof Error &&
          (error.message.startsWith("Connect MyAnimeList") ||
            error.message.includes("not a MyAnimeList export"))
            ? error.message
            : "The selected file is not a valid MyAnimeList export."
        send(`<p class="error">${escapeHtml(message)}</p>`)
      } finally {
        send(`<p><a href="/library">Back to library</a></p></body></html>`)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}

export function progressLine(progress: MalXmlImportProgress) {
  return `<p class="progress">${progress.processed} of ${progress.total} processed &mdash; ${progress.created} created, ${progress.merged} merged, ${progress.skipped} skipped, ${progress.failed} failed.</p>`
}

export function failureListHtml(failures: Array<{ externalId: string; title: string; error: string }>, max = 20) {
  if (!failures.length) return ""
  const shown = failures.slice(0, max)
  const remaining = failures.length - shown.length
  return `<h2>Failed entries</h2><ul>${shown
    .map(
      (failure) =>
        `<li><strong>${escapeHtml(failure.title)}</strong> (ID ${escapeHtml(failure.externalId)}): <span class="error">${escapeHtml(failure.error)}</span></li>`,
    )
    .join("")}${remaining > 0 ? `<li>&hellip;and ${remaining} more.</li>` : ""}</ul>`
}
