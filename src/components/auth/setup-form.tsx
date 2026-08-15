"use client"

import { useActionState } from "react"

import { setupAction } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EMPTY_FORM_STATE } from "@/lib/validation"

export function SetupForm() {
  const [state, formAction, pending] = useActionState(setupAction, EMPTY_FORM_STATE)

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create the owner account</CardTitle>
        <CardDescription>
          This setup screen disappears permanently after the first account is created.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input id="name" name="name" autoComplete="name" required />
            {state.errors?.name ? <p className="text-sm text-destructive">{state.errors.name[0]}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
            {state.errors?.email ? <p className="text-sm text-destructive">{state.errors.email[0]}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
            {state.errors?.password ? (
              <p className="text-sm text-destructive">{state.errors.password[0]}</p>
            ) : null}
          </div>
          {state.message ? <p className="text-sm text-destructive">{state.message}</p> : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
