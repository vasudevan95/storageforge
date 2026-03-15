import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'StoryForge — Living Biography Engine',
  description: 'Every life is a story. We help you read yours.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-stone-950 text-stone-100 antialiased">{children}</body>
    </html>
  )
}
