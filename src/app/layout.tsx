import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import Script from "next/script"

import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const runtime = "nodejs"

export const metadata: Metadata = {
  title: {
    default: "Registered Backlog Items",
    template: "%s · Registered Backlog Items",
  },
  description: "A single-user backlog library for manual entries, Steam, and MyAnimeList sync.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <Script id="theme" strategy="beforeInteractive" async>
          {`try{const t=localStorage.getItem("theme");document.documentElement.classList.toggle("dark",t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))}catch{}`}
        </Script>
      </head>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  )
}
