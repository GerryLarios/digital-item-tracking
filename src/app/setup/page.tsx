import { redirect } from "next/navigation"

import { SetupForm } from "@/components/auth/setup-form"
import { ThemeToggle } from "@/components/theme-toggle"
import { getSession, isInitialSetupOpen } from "@/lib/auth"

export const metadata = {
  title: "Initial setup",
}

export const dynamic = "force-dynamic"

export default async function SetupPage() {
  if (!isInitialSetupOpen()) {
    const session = await getSession()
    redirect(session?.user ? "/library" : "/login")
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Registered Backlog Items</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Create the only local account. Registration closes automatically after this step.
          </p>
        </div>
        <SetupForm />
      </div>
    </div>
  )
}
