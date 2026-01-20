import { Suspense } from 'react'
import { getAllSkills } from '@/lib/skills-server'
import { getConfig } from '@/lib/config'
import { Dashboard } from '@/components/Dashboard'

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

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Dashboard skills={skills} config={config} />
    </Suspense>
  )
}
