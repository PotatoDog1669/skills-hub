'use client'

import { Skill } from '@/lib/skills-types'
import { AppConfig } from '@/lib/config'
import { SkillCard, ViewContext } from './SkillCard'
import { SyncModal } from './SyncModal'
import { useEffect, useMemo, useState } from 'react'
import { IntroductionView } from './IntroductionView'
import { SkillDetailView } from './SkillDetailView'
import { useSearchParams } from '@/apps/desktop-ui/src/shims/navigation'
import { ImportSkillModal } from './ImportSkillModal'
import { CreateSkillModal } from './CreateSkillModal'
import { Download, Plus } from 'lucide-react'
import Link from '@/apps/desktop-ui/src/shims/link'
import { ProviderPanel } from './ProviderPanel'
import type { AppType, ProviderRecord, UniversalProviderRecord } from '@/lib/core/provider-types'
import type { KitLoadoutRecord, KitPolicyRecord, KitRecord } from '@/lib/core/kit-types'
import { KitPanel } from './KitPanel'
import { SkillsMarketView } from './SkillsMarketView'
import {
  AgentSkillScope,
  SKILL_TAG_ALL,
  collectAvailableSkillTags,
  filterSkillGroups,
  groupSkillsByName,
} from '@/lib/core/skill-filter'

interface DashboardProps {
  skills: Skill[]
  config: AppConfig
  providers: ProviderRecord[]
  universalProviders: UniversalProviderRecord[]
  currentProviders: Record<AppType, ProviderRecord | null>
  kitPolicies: KitPolicyRecord[]
  kitLoadouts: KitLoadoutRecord[]
  kits: KitRecord[]
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
  kitPolicies,
  kitLoadouts,
  kits,
}: DashboardProps) {
  const searchParams = useSearchParams()
  const rawView = searchParams.get('view') || 'inventory-skills'
  const currentView = rawView === 'deploy' ? 'inventory-skills' : rawView
  const currentId = searchParams.get('id')

  const viewContext: ViewContext = { view: currentView, id: currentId }

  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState(SKILL_TAG_ALL)
  const [agentScope, setAgentScope] = useState<AgentSkillScope>('all')
  const shouldEnableTagFilter = currentView !== 'agent' && currentView !== 'hub'

  const allGroups = useMemo(() => {
    return groupSkillsByName(skills)
  }, [skills])

  const filterContext = useMemo(
    () => ({
      currentView,
      currentId,
      agentScope,
    }),
    [agentScope, currentId, currentView]
  )

  const availableTags = useMemo(
    () => (shouldEnableTagFilter ? collectAvailableSkillTags(allGroups, filterContext) : []),
    [allGroups, filterContext, shouldEnableTagFilter]
  )

  const filteredGroups = useMemo(() => {
    return filterSkillGroups(allGroups, {
      ...filterContext,
      selectedTag: shouldEnableTagFilter ? selectedTag : SKILL_TAG_ALL,
      searchQuery,
    })
  }, [allGroups, filterContext, searchQuery, selectedTag, shouldEnableTagFilter])

  useEffect(() => {
    if (currentView !== 'agent' && agentScope !== 'all') {
      setAgentScope('all')
    }
  }, [agentScope, currentView])

  useEffect(() => {
    if (selectedTag === SKILL_TAG_ALL) {
      return
    }
    if (!availableTags.includes(selectedTag)) {
      setSelectedTag(SKILL_TAG_ALL)
    }
  }, [availableTags, selectedTag])

  const handleSync = (skill: Skill) => {
    setSelectedSkill(skill)
    setIsModalOpen(true)
  }

  const title =
    currentView === 'inventory-providers'
      ? 'Providers'
      : currentView === 'inventory-skills' || currentView === 'all'
        ? 'Skills'
      : currentView === 'inventory-kit'
          ? 'Kit'
          : currentView === 'projects'
            ? 'Projects'
            : currentView === 'hub'
                ? 'Hub'
                : currentView === 'agent'
                  ? currentId || 'Agent'
                  : currentView === 'introduction'
                    ? 'Introduction'
                    : currentView === 'skills-market'
                      ? 'Skills Market'
                    : currentView === 'detail'
                      ? 'Skill Details'
                      : 'Skills'

  if (currentView === 'introduction') {
    return <IntroductionView />
  }

  if (currentView === 'skills-market') {
    return <SkillsMarketView />
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

  if (currentView === 'inventory-kit') {
    return (
      <div className="container py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{title}</h1>
          <span className="text-sm text-gray-500">{kits.length} kits</span>
        </div>
        <KitPanel
          policies={kitPolicies}
          loadouts={kitLoadouts}
          kits={kits}
          skills={skills}
          projects={config.projects}
          agents={config.agents}
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

  const filterButtonClass = (isActive: boolean) =>
    `inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
      isActive
        ? 'bg-[#d97757] text-white border-[#d97757]'
        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
    }`

  return (
    <div className="container py-8">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col">
              <h1 className="text-3xl font-bold">{title}</h1>
              {currentView === 'project' && currentId && (
                <div className="text-xs text-muted-foreground mt-1 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100 self-start">
                  {currentId}
                </div>
              )}
            </div>
            {currentView === 'hub' && (
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

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by skill name or description"
              aria-label="Search skills"
              className="w-full lg:max-w-2xl rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#d97757] focus:ring-1 focus:ring-[#d97757]"
            />

            {currentView === 'agent' && (
              <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setAgentScope('all')}
                  className={filterButtonClass(agentScope === 'all')}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setAgentScope('global')}
                  className={filterButtonClass(agentScope === 'global')}
                >
                  Global
                </button>
                <button
                  type="button"
                  onClick={() => setAgentScope('project')}
                  className={filterButtonClass(agentScope === 'project')}
                >
                  Project
                </button>
              </div>
            )}
          </div>

          {shouldEnableTagFilter && availableTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedTag(SKILL_TAG_ALL)}
                className={filterButtonClass(selectedTag === SKILL_TAG_ALL)}
              >
                {SKILL_TAG_ALL}
              </button>
              {availableTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={filterButtonClass(selectedTag === tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
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
