import { redirect } from "next/navigation"

import { getSession, hasAnyUsers } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  if (!hasAnyUsers()) {
    redirect("/setup")
  }

  const session = await getSession()
  redirect(session?.user ? "/library" : "/login")
}
