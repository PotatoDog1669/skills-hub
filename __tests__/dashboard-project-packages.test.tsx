import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { Dashboard } from '@/components/Dashboard'
import type { AppConfig } from '@/lib/config'
import type { Skill } from '@/lib/skills-types'

const { actionMocks } = vi.hoisted(() => ({
  actionMocks: {
    actionSetProjectSkillPackageEnabled: vi.fn(),
  },
}))

vi.mock('@/apps/desktop-ui/src/shims/link', () => ({
  default: ({
    children,
    ...props
  }: { children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

vi.mock('@/apps/desktop-ui/src/shims/navigation', () => ({
  useSearchParams: () => new URLSearchParams('view=project&id=%2Ftmp%2Finsight-flow'),
}))

vi.mock('@/apps/desktop-ui/src/tauri-actions', () => ({
  actionSetProjectSkillPackageEnabled: actionMocks.actionSetProjectSkillPackageEnabled,
}))

vi.mock('@/components/SkillCard', () => ({
  SkillCard: ({ unifiedSkill }: { unifiedSkill: { name: string } }) => <div>{unifiedSkill.name}</div>,
}))

vi.mock('@/components/SyncModal', () => ({
  SyncModal: () => null,
}))

vi.mock('@/components/ImportSkillModal', () => ({
  ImportSkillModal: () => null,
}))

vi.mock('@/components/CreateSkillModal', () => ({
  CreateSkillModal: () => null,
}))

vi.mock('@/components/ProviderPanel', () => ({
  ProviderPanel: () => null,
}))

vi.mock('@/components/KitPanel', () => ({
  KitPanel: () => null,
}))

vi.mock('@/components/SkillsMarketView', () => ({
  SkillsMarketView: () => null,
}))

vi.mock('@/components/SkillDetailView', () => ({
  SkillDetailView: () => null,
}))

const baseConfig: AppConfig = {
  hubPath: '/tmp/hub',
  projects: ['/tmp/insight-flow'],
  scanRoots: [],
  agents: [],
}

const projectSkills: Skill[] = [
  {
    id: 'skill-1',
    name: 'research-helper',
    description: 'Research helper',
    path: '/tmp/insight-flow/.codex/skills/research-helper',
    location: 'project',
    projectName: 'insight-flow',
    projectPath: '/tmp/insight-flow',
    enabled: true,
    sourcePackageId: 'pkg-superpowers',
    sourcePackageName: 'superpowers',
  },
  {
    id: 'skill-2',
    name: 'writer-helper',
    description: 'Writer helper',
    path: '/tmp/insight-flow/.codex/skills/writer-helper',
    location: 'project',
    projectName: 'insight-flow',
    projectPath: '/tmp/insight-flow',
    enabled: true,
    sourcePackageId: 'pkg-superpowers',
    sourcePackageName: 'superpowers',
  },
  {
    id: 'skill-3',
    name: 'review-helper',
    description: 'Review helper',
    path: '/tmp/insight-flow/.skills-hub/disabled-skills/Codex/review-helper',
    location: 'project',
    projectName: 'insight-flow',
    projectPath: '/tmp/insight-flow',
    enabled: false,
    sourcePackageId: 'pkg-superpowers',
    sourcePackageName: 'superpowers',
  },
]

describe('Dashboard project package actions', () => {
  beforeEach(() => {
    actionMocks.actionSetProjectSkillPackageEnabled.mockReset()
    actionMocks.actionSetProjectSkillPackageEnabled.mockResolvedValue(2)
  })

  it('renders package controls for the current project and disables a package in one action', async () => {
    render(
      <Dashboard
        skills={projectSkills}
        config={baseConfig}
        providers={[]}
        universalProviders={[]}
        currentProviders={{ claude: null, codex: null, gemini: null }}
        kitPolicies={[]}
        kitLoadouts={[]}
        kits={[]}
        officialPresets={[]}
      />
    )

    expect(screen.getByText('Project Packages')).toBeTruthy()
    expect(screen.getByText('superpowers')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Disable 2/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Enable 1/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Disable 2/i }))

    await waitFor(() =>
      expect(actionMocks.actionSetProjectSkillPackageEnabled).toHaveBeenCalledWith({
        projectPath: '/tmp/insight-flow',
        enabled: false,
        packageId: 'pkg-superpowers',
        packageName: 'superpowers',
      })
    )
  })
})
