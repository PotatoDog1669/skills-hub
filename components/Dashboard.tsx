'use client'

import { Skill } from '@/lib/skills-types'
import { AppConfig } from '@/lib/config'
import { SkillCard, UnifiedSkill, ViewContext } from './SkillCard'
import { SyncModal } from './SyncModal'
import { useState } from 'react'
import { IntroductionView } from './IntroductionView'
import { SkillDetailView } from './SkillDetailView'
import { useSearchParams } from 'next/navigation'
import { ImportSkillModal } from './ImportSkillModal'
import { CreateSkillModal } from './CreateSkillModal'
import { Download, Plus } from 'lucide-react'

interface DashboardProps {
  skills: Skill[]
  config: AppConfig
}

export function Dashboard({ skills, config }: DashboardProps) {
  const searchParams = useSearchParams()
  const currentView = searchParams.get('view') || 'all'
  const currentId = searchParams.get('id')

  const viewContext: ViewContext = { view: currentView, id: currentId }

  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // 1. Group ALL skills first.
  const allGroups: Record<string, UnifiedSkill> = {}
  skills.forEach((skill) => {
    if (!allGroups[skill.name]) {
      allGroups[skill.name] = {
        name: skill.name,
        description: skill.description,
        instances: [],
      }
    }
    if (skill.description && skill.description.length > allGroups[skill.name].description.length) {
      allGroups[skill.name].description = skill.description
    }
    allGroups[skill.name].instances.push(skill)
  })

  // 2. Filter Groups based on View
  const filteredGroups = Object.values(allGroups).filter((group) => {
    if (currentView === 'all') return true

    if (currentView === 'hub') {
      return group.instances.some((s) => s.location === 'hub')
    }
    if (currentView === 'agent') {
      return group.instances.some((s) => s.agentName === currentId)
    }
    if (currentView === 'project') {
      return group.instances.some((s) => s.path.startsWith(currentId || ''))
    }
    return true
  })

  const handleSync = (skill: Skill) => {
    setSelectedSkill(skill)
    setIsModalOpen(true)
  }

  const title =
    currentView === 'all'
      ? 'All Skills'
      : currentView === 'hub'
        ? 'Central Skills Hub'
        : currentView === 'agent'
          ? `${currentId} Skills`
          : currentView === 'introduction'
            ? 'Introduction'
            : currentView === 'detail'
              ? 'Skill Details'
              : `Project Skills`

  if (currentView === 'introduction') {
    return <IntroductionView />
  }

  if (currentView === 'detail') {
    const path = searchParams.get('path')
    if (path) return <SkillDetailView path={path} />
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
