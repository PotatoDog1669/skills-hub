'use client'

import { Skill } from '@/lib/skills-types'
import { AppConfig } from '@/lib/config'
import { SkillCard, UnifiedSkill, ViewContext } from './SkillCard'
import { SyncModal } from './SyncModal'
import { useMemo, useState } from 'react'
import { IntroductionView } from './IntroductionView'
import { SkillDetailView } from './SkillDetailView'
import { useSearchParams } from 'next/navigation'
import { ImportSkillModal } from './ImportSkillModal'
import { CreateSkillModal } from './CreateSkillModal'
import { Download, Plus } from 'lucide-react'
import Link from 'next/link'
import { ProviderPanel } from './ProviderPanel'
import type { AppType, ProviderRecord, UniversalProviderRecord } from '@/lib/core/provider-types'

interface DashboardProps {
  skills: Skill[]
  config: AppConfig
  providers: ProviderRecord[]
  universalProviders: UniversalProviderRecord[]
  currentProviders: Record<AppType, ProviderRecord | null>
}

function PlaceholderCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-gray-500 mt-2">{text}</p>
    </div>
  )
}

export function Dashboard({
  skills,
  config,
  providers,
  universalProviders,
  currentProviders,
}: DashboardProps) {
  const searchParams = useSearchParams()
  const currentView = searchParams.get('view') || 'inventory-skills'
  const currentId = searchParams.get('id')

  const viewContext: ViewContext = { view: currentView, id: currentId }

  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  const allGroups = useMemo(() => {
    const groups: Record<string, UnifiedSkill> = {}
    skills.forEach((skill) => {
      if (!groups[skill.name]) {
        groups[skill.name] = {
          name: skill.name,
          description: skill.description,
          instances: [],
        }
      }
      if (skill.description && skill.description.length > groups[skill.name].description.length) {
        groups[skill.name].description = skill.description
      }
      groups[skill.name].instances.push(skill)
    })

    return groups
  }, [skills])

  const filteredGroups = useMemo(() => {
    return Object.values(allGroups).filter((group) => {
      if (currentView === 'inventory-skills' || currentView === 'all') return true
      if (currentView === 'hub') return group.instances.some((s) => s.location === 'hub')
      if (currentView === 'agent') return group.instances.some((s) => s.agentName === currentId)
      if (currentView === 'project')
        return group.instances.some((s) => s.path.startsWith(currentId || ''))
      return false
    })
  }, [allGroups, currentId, currentView])

  const handleSync = (skill: Skill) => {
    setSelectedSkill(skill)
    setIsModalOpen(true)
  }

  const title =
    currentView === 'inventory-providers'
      ? 'Inventory / Providers'
      : currentView === 'inventory-skills' || currentView === 'all'
        ? 'Inventory / Skills'
        : currentView === 'inventory-loadouts'
          ? 'Inventory / Loadouts'
          : currentView === 'inventory-policies'
            ? 'Inventory / Policies'
            : currentView === 'projects'
              ? 'Projects'
              : currentView === 'deploy'
                ? 'Deploy'
                : currentView === 'hub'
                  ? 'Inventory / Skills / Hub'
                  : currentView === 'agent'
                    ? `Projects / Agent / ${currentId}`
                    : currentView === 'introduction'
                      ? 'Introduction'
                      : currentView === 'detail'
                        ? 'Skill Details'
                        : 'Projects / Skills'

  if (currentView === 'introduction') {
    return <IntroductionView />
  }

  if (currentView === 'detail') {
    const skillPath = searchParams.get('path')
    if (skillPath) return <SkillDetailView path={skillPath} />
  }

  if (currentView === 'inventory-providers') {
    return (
      <div className="container py-8 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">{title}</h1>
          <span className="text-muted-foreground">{providers.length} providers configured</span>
        </div>
        <ProviderPanel
          providers={providers}
          universalProviders={universalProviders}
          currentProviders={currentProviders}
        />
      </div>
    )
  }

  if (currentView === 'inventory-loadouts') {
    return (
      <div className="container py-8 space-y-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        <PlaceholderCard
          title="Loadouts are planned next"
          text="M1 聚焦 Provider 切换稳定性，Loadout 在下一里程碑接入。"
        />
      </div>
    )
  }

  if (currentView === 'inventory-policies') {
    return (
      <div className="container py-8 space-y-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        <PlaceholderCard
          title="Policy templates are planned next"
          text="M1 先交付 Provider，Policy (AGENTS.md 模板) 将在后续里程碑落地。"
        />
      </div>
    )
  }

  if (currentView === 'projects') {
    return (
      <div className="container py-8 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">{title}</h1>
          <span className="text-muted-foreground">{config.projects.length} projects</span>
        </div>
        {config.projects.length === 0 ? (
          <PlaceholderCard
            title="No projects yet"
            text="在 Sidebar 的 Projects 区域添加项目，或用 Scan Roots 自动发现 Git 项目。"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {config.projects.map((projectPath) => (
              <Link
                key={projectPath}
                href={`/?view=project&id=${encodeURIComponent(projectPath)}`}
                className="rounded-lg border border-gray-200 bg-white p-4 hover:bg-gray-50"
              >
                <div className="font-medium">{projectPath.split('/').pop()}</div>
                <div className="text-xs text-gray-500 mt-1 font-mono">{projectPath}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (currentView === 'deploy') {
    return (
      <div className="container py-8 space-y-6">
        <h1 className="text-3xl font-bold">{title}</h1>
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <div className="text-sm text-gray-600">
            一键部署入口在后续里程碑上线。当前可先在 Inventory/Providers 完成账号切换，再执行 Skills
            Sync。
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {Object.entries(currentProviders).map(([appType, provider]) => (
              <div key={appType} className="rounded border border-gray-200 p-3">
                <div className="text-xs uppercase tracking-wide text-gray-500">{appType}</div>
                <div className="font-medium mt-1">{provider?.name || 'Not selected'}</div>
              </div>
            ))}
          </div>
          <Link
            href="/?view=inventory-providers"
            className="inline-block px-3 py-1.5 text-sm bg-[#d97757] text-white rounded-md"
          >
            Open Provider Inventory
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-3xl font-bold">{title}</h1>
            {currentView === 'project' && currentId && (
              <div className="text-xs text-muted-foreground mt-1 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100 self-start">
                {currentId}
              </div>
            )}
          </div>
          {(currentView === 'hub' || currentView === 'inventory-skills') && (
            <div className="flex gap-2">
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors shadow-sm"
              >
                <Plus size={14} className="text-gray-500" />
                <span>Create Skill</span>
              </button>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 font-medium bg-[#d97757] text-white border border-transparent rounded-md hover:bg-[#c05f3e] transition-colors shadow-sm text-sm"
              >
                <Download size={14} />
                <span>Import Skill</span>
              </button>
            </div>
          )}
        </div>
        <span className="text-muted-foreground">{filteredGroups.length} skills found</span>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="text-center py-20 bg-muted/30 rounded-lg border border-dashed">
          <p className="text-muted-foreground">No skills found in this view.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map((group) => (
            <SkillCard
              key={group.name}
              unifiedSkill={group}
              onSync={handleSync}
              viewContext={viewContext}
            />
          ))}
        </div>
      )}

      {selectedSkill && (
        <SyncModal
          skill={selectedSkill}
          config={config}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      <ImportSkillModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} />

      <CreateSkillModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
    </div>
  )
}
