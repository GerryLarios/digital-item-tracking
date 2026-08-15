import Link from "next/link"

import { logoutAction } from "@/app/actions/auth"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button, buttonVariants } from "@/components/ui/button"

export function AppShell({
  userLabel,
  children,
}: {
  userLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/library" className="text-lg font-semibold tracking-tight">
              Registered Backlog Items
            </Link>
            <nav className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <Link href="/library" className="hover:text-foreground">
                Library
              </Link>
              <Link href="/settings/integrations" className="hover:text-foreground">
                Integrations
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span className="hidden text-sm text-muted-foreground sm:inline">{userLabel}</span>
            <Link href="/library/new" className={buttonVariants({ variant: "outline" })}>
              New item
            </Link>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
