import { Suspense } from 'react'
import { getAllSkills } from '@/lib/skills-server'
import { getConfig } from '@/lib/config'
import { Dashboard } from '@/components/Dashboard'
import {
  APP_TYPES,
  listProviders,
  listUniversalProviders,
  maskProviders,
} from '@/lib/core/provider-core.mjs'
import type { AppType, ProviderRecord, UniversalProviderRecord } from '@/lib/core/provider-types'

export const dynamic = 'force-dynamic'

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  )
}

export default async function Home() {
  const skills = await getAllSkills()
  const config = await getConfig()
  const providers = maskProviders(listProviders()) as ProviderRecord[]
  const universalProviderRows = listUniversalProviders() as UniversalProviderRecord[]
  const universalProviders = universalProviderRows.map((provider) => ({
    ...provider,
    apiKey: provider.apiKey.trim() ? `${provider.apiKey.slice(0, 3)}****` : '',
  })) as UniversalProviderRecord[]
  const currentProviders = Object.fromEntries(
    APP_TYPES.map((appType) => {
      const current = providers.find(
        (provider) => provider.appType === appType && provider.isCurrent
      )
      return [appType, current || null]
    })
  ) as Record<AppType, ProviderRecord | null>

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Dashboard
        skills={skills}
        config={config}
        providers={providers}
        universalProviders={universalProviders}
        currentProviders={currentProviders}
      />
    </Suspense>
  )
}
