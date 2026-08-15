import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="space-y-4 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Not found</h1>
        <p className="text-muted-foreground">The requested page does not exist or is no longer available.</p>
        <Link href="/library" className={buttonVariants()}>
          Back to library
        </Link>
      </div>
    </div>
  )
}
