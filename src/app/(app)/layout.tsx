import { AppShell } from "@/components/layout/app-shell"
import { requireSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireSession()

  return <AppShell userLabel={session.user.email}>{children}</AppShell>
}
