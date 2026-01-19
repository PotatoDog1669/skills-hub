import { Sidebar } from '@/components/Sidebar';
import { AppConfig, getConfig } from '@/lib/config';
import { Suspense } from 'react';
import './globals.css';
import { ConfirmProvider } from '@/components/ConfirmProvider';

export const metadata = {
  title: 'Skills Hub',
  description: 'Manage your AI agent skills centrally',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const config = await getConfig();

  return (
    <html lang="en">
      <body>
        <ConfirmProvider>
          <div className="flex">
            <Suspense fallback={<div className="w-[250px] border-r h-screen" />}>
              <Sidebar config={config} />
            </Suspense>
            <main className="flex-1 ml-[250px] p-8 min-h-screen">
              {children}
            </main>
          </div>
        </ConfirmProvider>
      </body>
    </html>
  );
}
