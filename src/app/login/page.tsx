import { redirect } from "next/navigation"

import { LoginForm } from "@/components/auth/login-form"
import { ThemeToggle } from "@/components/theme-toggle"
import { getSession, hasAnyUsers } from "@/lib/auth"

export const metadata = {
  title: "Sign in",
}

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  if (!hasAnyUsers()) {
    redirect("/setup")
  }

  const session = await getSession()
  if (session?.user) {
    redirect("/library")
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Sign in to access your local backlog, integrations, and cached artwork.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
