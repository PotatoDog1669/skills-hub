import { Suspense } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { getConfig } from '@/lib/config'
import './globals.css'
import { ConfirmProvider } from '@/components/ConfirmProvider'

export const metadata = {
  title: 'Skills Hub',
  description: 'Manage your AI agent skills centrally',
  icons: {
    icon: '/icon.svg',
  },
}

function SidebarFallback() {
  return <div className="w-[250px] fixed left-0 h-full bg-muted/30"></div>
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = await getConfig()

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ConfirmProvider>
          <div className="flex">
            <Suspense fallback={<SidebarFallback />}>
              <Sidebar config={config} />
            </Suspense>
            <main className="flex-1 ml-[250px] p-8 min-h-screen">{children}</main>
          </div>
        </ConfirmProvider>
      </body>
    </html>
  )
}
