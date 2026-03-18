import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { KitPanel } from '@/components/KitPanel'
import type {
  KitApplyResult,
  KitLoadoutImportResult,
  KitLoadoutRecord,
  KitPolicyRecord,
  KitRecord,
  OfficialPresetSummary,
} from '@/lib/core/kit-types'
import type { AgentConfig } from '@/lib/config'
import type { Skill } from '@/lib/skills-types'

const now = 1_700_000_000_000

const { refreshMock, confirmMock, promptMock, actionMocks } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  confirmMock: vi.fn(),
  promptMock: vi.fn(),
  actionMocks: {
    actionOfficialPresetInspect: vi.fn(),
    actionOfficialPresetInstall: vi.fn(),
    actionOfficialPresetInstallAll: vi.fn(),
    actionOpenExternal: vi.fn(),
    actionAddProject: vi.fn(),
    actionKitAdd: vi.fn(),
    actionKitApply: vi.fn(),
    actionKitDelete: vi.fn(),
    actionKitLoadoutAdd: vi.fn(),
    actionKitLoadoutDelete: vi.fn(),
    actionKitLoadoutImportFromRepo: vi.fn(),
    actionKitLoadoutUpdate: vi.fn(),
    actionKitPolicyAdd: vi.fn(),
    actionKitPolicyDelete: vi.fn(),
    actionKitPolicyResolveGithub: vi.fn(),
    actionKitPolicyUpdate: vi.fn(),
    actionKitRestoreManagedBaseline: vi.fn(),
    actionKitUpdate: vi.fn(),
    actionPickDirectory: vi.fn(),
  },
}))

vi.mock('@/apps/desktop-ui/src/shims/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}))

vi.mock('@/components/ConfirmProvider', () => ({
  useConfirm: () => ({
    confirm: confirmMock,
    prompt: promptMock,
  }),
}))

vi.mock('@/apps/desktop-ui/src/tauri-actions', () => ({
  actionOfficialPresetInspect: actionMocks.actionOfficialPresetInspect,
  actionOfficialPresetInstall: actionMocks.actionOfficialPresetInstall,
  actionOfficialPresetInstallAll: actionMocks.actionOfficialPresetInstallAll,
  actionOpenExternal: actionMocks.actionOpenExternal,
  actionAddProject: actionMocks.actionAddProject,
  actionKitAdd: actionMocks.actionKitAdd,
  actionKitApply: actionMocks.actionKitApply,
  actionKitDelete: actionMocks.actionKitDelete,
  actionKitLoadoutAdd: actionMocks.actionKitLoadoutAdd,
  actionKitLoadoutDelete: actionMocks.actionKitLoadoutDelete,
  actionKitLoadoutImportFromRepo: actionMocks.actionKitLoadoutImportFromRepo,
  actionKitLoadoutUpdate: actionMocks.actionKitLoadoutUpdate,
  actionKitPolicyAdd: actionMocks.actionKitPolicyAdd,
  actionKitPolicyDelete: actionMocks.actionKitPolicyDelete,
  actionKitPolicyResolveGithub: actionMocks.actionKitPolicyResolveGithub,
  actionKitPolicyUpdate: actionMocks.actionKitPolicyUpdate,
  actionKitRestoreManagedBaseline: actionMocks.actionKitRestoreManagedBaseline,
  actionKitUpdate: actionMocks.actionKitUpdate,
  actionPickDirectory: actionMocks.actionPickDirectory,
}))

const officialPresets: OfficialPresetSummary[] = []

const policies: KitPolicyRecord[] = [
  {
    id: 'policy-a',
    name: 'Base Policy',
    description: 'Default',
    content: '# AGENTS.md\n',
    createdAt: now,
    updatedAt: now,
  },
]

const loadouts: KitLoadoutRecord[] = [
  {
    id: 'loadout-a',
    name: 'Base Loadout',
    description: 'Starter',
    items: [
      { skillPath: '/tmp/base-skill', mode: 'copy', sortOrder: 0 },
      { skillPath: '/tmp/extra-skill', mode: 'copy', sortOrder: 1 },
    ],
    createdAt: now,
    updatedAt: now,
  },
]

const hubSkills: Skill[] = [
  {
    id: 'skill-base',
    name: 'base-skill',
    description: 'Base skill',
    path: '/tmp/base-skill',
    location: 'hub',
  },
  {
    id: 'skill-extra',
    name: 'extra-skill',
    description: 'Extra skill',
    path: '/tmp/extra-skill',
    location: 'hub',
  },
]

const agents: AgentConfig[] = [
  {
    name: 'Codex',
    globalPath: '/tmp/.codex/skills',
    projectPath: '.codex/skills',
    instructionFileName: 'AGENTS.md',
    enabled: true,
    isCustom: false,
  },
]

const kits: KitRecord[] = [
  {
    id: 'kit-a',
    name: 'Base Kit',
    description: 'Starter kit',
    policyId: 'policy-a',
    loadoutId: 'loadout-a',
    createdAt: now,
    updatedAt: now,
  },
]

describe('KitPanel loadout import', () => {
  const scrollIntoViewMock = vi.fn()

  beforeEach(() => {
    cleanup()
    refreshMock.mockReset()
    confirmMock.mockReset()
    promptMock.mockReset()
    scrollIntoViewMock.mockReset()
    confirmMock.mockResolvedValue(true)
    promptMock.mockResolvedValue(null)
    Object.values(actionMocks).forEach((mockFn) => mockFn.mockReset())
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    })
  })

  it('opens repo import dialog and submits import action', async () => {
    const importedResult: KitLoadoutImportResult = {
      loadout: {
        id: 'loadout-imported',
        name: 'superpowers',
        description: 'Imported skills',
        items: [
          { skillPath: '/tmp/superpowers/a', mode: 'copy', sortOrder: 0 },
          { skillPath: '/tmp/superpowers/b', mode: 'copy', sortOrder: 1 },
        ],
        importSource: {
          repoWebUrl: 'https://github.com/obra/superpowers',
          repoUrl: 'https://github.com/obra/superpowers.git',
          originalUrl: 'https://github.com/obra/superpowers',
          branch: 'main',
          rootSubdir: 'skills',
          importedAt: '2026-03-11T00:00:00.000Z',
          lastSourceUpdatedAt: '2026-03-10T00:00:00.000Z',
        },
        createdAt: now,
        updatedAt: now,
      },
      loadoutStatus: 'created',
      importedSkillPaths: ['/tmp/superpowers/a', '/tmp/superpowers/b'],
      overwrittenCount: 1,
      removedCount: 0,
      discoveredCount: 2,
      source: {
        repoWebUrl: 'https://github.com/obra/superpowers',
        repoUrl: 'https://github.com/obra/superpowers.git',
        originalUrl: 'https://github.com/obra/superpowers',
        branch: 'main',
        rootSubdir: 'skills',
        importedAt: '2026-03-11T00:00:00.000Z',
        lastSourceUpdatedAt: '2026-03-10T00:00:00.000Z',
      },
    }

    actionMocks.actionKitLoadoutImportFromRepo.mockResolvedValue(importedResult)

    render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={[]}
        officialPresets={officialPresets}
        skills={[]}
        projects={[]}
        agents={agents}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '从仓库导入' }))
    fireEvent.change(
      screen.getByPlaceholderText(/https:\/\/github\.com\/obra\/superpowers/),
      { target: { value: 'https://github.com/obra/superpowers' } }
    )
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '导入并创建 package' }))

    await waitFor(() =>
      expect(actionMocks.actionKitLoadoutImportFromRepo).toHaveBeenCalledWith({
        url: 'https://github.com/obra/superpowers',
        name: undefined,
        description: undefined,
        overwrite: true,
      })
    )

    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(screen.getByText(/已导入 2 个 Skills/)).toBeTruthy()
  })

  it('shows an update message when re-import refreshes an existing package', async () => {
    const importedResult: KitLoadoutImportResult = {
      loadout: {
        id: 'loadout-imported',
        name: 'Official Source: Release CI Automation / Superpowers Core',
        description: 'Imported skills',
        items: [{ skillPath: '/tmp/superpowers/a', mode: 'copy', sortOrder: 0 }],
        importSource: {
          repoWebUrl: 'https://github.com/obra/superpowers',
          repoUrl: 'https://github.com/obra/superpowers.git',
          originalUrl: 'https://github.com/obra/superpowers',
          branch: 'main',
          rootSubdir: 'skills',
          importedAt: '2026-03-11T00:00:00.000Z',
          lastSourceUpdatedAt: '2026-03-10T00:00:00.000Z',
        },
        createdAt: now,
        updatedAt: now,
      },
      loadoutStatus: 'updated',
      importedSkillPaths: ['/tmp/superpowers/a'],
      overwrittenCount: 1,
      removedCount: 1,
      discoveredCount: 1,
      source: {
        repoWebUrl: 'https://github.com/obra/superpowers',
        repoUrl: 'https://github.com/obra/superpowers.git',
        originalUrl: 'https://github.com/obra/superpowers',
        branch: 'main',
        rootSubdir: 'skills',
        importedAt: '2026-03-11T00:00:00.000Z',
        lastSourceUpdatedAt: '2026-03-10T00:00:00.000Z',
      },
    }

    actionMocks.actionKitLoadoutImportFromRepo.mockResolvedValue(importedResult)

    render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={[]}
        officialPresets={officialPresets}
        skills={[]}
        projects={[]}
        agents={agents}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '从仓库导入' }))
    fireEvent.change(
      screen.getByPlaceholderText(/https:\/\/github\.com\/obra\/superpowers/),
      { target: { value: 'https://github.com/obra/superpowers' } }
    )
    fireEvent.click(screen.getByRole('button', { name: '导入并创建 package' }))

    await waitFor(() => expect(refreshMock).toHaveBeenCalled())
    expect(screen.getByText(/已更新已有skills 包/)).toBeTruthy()
    expect(screen.getByText(/清理 1 个旧 Skill/)).toBeTruthy()
  })

  it('shows preset source loadouts even when no kit uses them', () => {
    render(
      <KitPanel
        policies={policies}
        loadouts={[
          ...loadouts,
          {
            id: 'loadout-superpowers-official',
            name: 'Official Source: Release CI Automation / Superpowers Core',
            description: 'Managed source package',
            items: [{ skillPath: '/tmp/superpowers/a', mode: 'copy', sortOrder: 0 }],
            createdAt: now,
            updatedAt: now,
          },
        ]}
        kits={[]}
        officialPresets={officialPresets}
        skills={hubSkills}
        projects={[]}
        agents={agents}
      />
    )

    expect(screen.getByText('Release CI Automation / Superpowers Core')).toBeTruthy()
  })

  it('shows both curated and source loadouts from official presets', () => {
    render(
      <KitPanel
        policies={policies}
        loadouts={[
          ...loadouts,
          {
            id: 'loadout-curated',
            name: 'Official: HF ML Training Evaluation',
            description: 'Curated preset package',
            items: [{ skillPath: '/tmp/hf-skill', mode: 'copy', sortOrder: 0 }],
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'loadout-source-hidden',
            name: 'Official Source: HF ML Training Evaluation / Hugging Face Skills',
            description: 'Source package',
            items: [{ skillPath: '/tmp/hf-source-skill', mode: 'copy', sortOrder: 0 }],
            createdAt: now,
            updatedAt: now,
          },
        ]}
        kits={[
          {
            id: 'kit-hf',
            name: 'Official: HF ML Training Evaluation',
            description: 'HF kit',
            policyId: 'policy-a',
            loadoutId: 'loadout-curated',
            createdAt: now,
            updatedAt: now,
          },
        ]}
        officialPresets={officialPresets}
        skills={hubSkills}
        projects={[]}
        agents={agents}
      />
    )

    expect(screen.getAllByText('HF ML Training Evaluation').length).toBeGreaterThan(0)
    expect(screen.getByText('HF ML Training Evaluation / Hugging Face Skills')).toBeTruthy()
  })

  it('renders loadouts and kits in scrollable lists instead of pagination', () => {
    const manyLoadouts: KitLoadoutRecord[] = Array.from({ length: 5 }, (_, index) => ({
      id: `loadout-${index + 1}`,
      name: `Loadout ${index + 1}`,
      description: `Loadout ${index + 1} description`,
      items: [{ skillPath: `/tmp/loadout-${index + 1}`, mode: 'copy', sortOrder: 0 }],
      createdAt: now,
      updatedAt: now,
    }))

    const manyKits: KitRecord[] = Array.from({ length: 4 }, (_, index) => ({
      id: `kit-${index + 1}`,
      name: `Kit ${index + 1}`,
      description: `Kit ${index + 1} description`,
      policyId: 'policy-a',
      loadoutId: manyLoadouts[Math.min(index, manyLoadouts.length - 1)]?.id,
      createdAt: now,
      updatedAt: now,
    }))

    render(
      <KitPanel
        policies={policies}
        loadouts={manyLoadouts}
        kits={manyKits}
        officialPresets={officialPresets}
        skills={hubSkills}
        projects={[]}
        agents={agents}
      />
    )

    expect(screen.getByRole('button', { name: '应用' })).toBeTruthy()
    expect(screen.getByTestId('loadout-card-loadout-1')).toBeTruthy()
    expect(screen.getByTestId('loadout-card-loadout-5')).toBeTruthy()
    expect(screen.getByText('Kit 1')).toBeTruthy()
    expect(screen.getByText('Kit 4')).toBeTruthy()

    expect(screen.queryByRole('button', { name: 'skills 包列表下一页' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Kit 列表下一页' })).toBeNull()
    expect(screen.getByTestId('loadout-list-scroll').className).toContain('overflow-y-auto')
    expect(screen.getByTestId('kit-list-scroll').className).toContain('overflow-y-auto')
  })

  it('reorders current package skills via drag and drop before save', async () => {
    actionMocks.actionKitLoadoutUpdate.mockResolvedValue({
      ...loadouts[0],
      items: [
        { skillPath: '/tmp/extra-skill', mode: 'copy', sortOrder: 0 },
        { skillPath: '/tmp/base-skill', mode: 'copy', sortOrder: 1 },
      ],
    })

    render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={[]}
        officialPresets={officialPresets}
        skills={hubSkills}
        projects={[]}
        agents={agents}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '编辑skills 包 Base Loadout' }))
    expect(screen.getByText('当前 package Skills')).toBeTruthy()
    expect(screen.getByText('Hub Skills')).toBeTruthy()

    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => '/tmp/extra-skill'),
      effectAllowed: 'move',
      dropEffect: 'move',
    }

    fireEvent.dragStart(screen.getByTestId('loadout-skill-extra-skill'), { dataTransfer })
    fireEvent.dragOver(screen.getByTestId('loadout-skill-base-skill'), { dataTransfer })
    fireEvent.drop(screen.getByTestId('loadout-skill-base-skill'), { dataTransfer })
    fireEvent.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() =>
      expect(actionMocks.actionKitLoadoutUpdate).toHaveBeenCalledWith({
        id: 'loadout-a',
        name: 'Base Loadout',
        description: 'Starter',
        items: [
          { skillPath: '/tmp/extra-skill', mode: 'copy', sortOrder: 0 },
          { skillPath: '/tmp/base-skill', mode: 'copy', sortOrder: 1 },
        ],
      })
    )
  })

  it('saves a kit with only a skills package selected', async () => {
    actionMocks.actionKitAdd.mockResolvedValue({
      id: 'kit-solo',
      name: 'Skills Only Kit',
      description: 'Loadout only',
      loadoutId: 'loadout-a',
      createdAt: now,
      updatedAt: now,
    })

    render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={[]}
        officialPresets={officialPresets}
        skills={hubSkills}
        projects={[]}
        agents={agents}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '新建' }))
    fireEvent.click(screen.getByRole('button', { name: /Base Loadout 2 skills/ }))
    fireEvent.change(screen.getByPlaceholderText(/Kit 名称/), {
      target: { value: 'Skills Only Kit' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存 Kit' }))

    await waitFor(() =>
      expect(actionMocks.actionKitAdd).toHaveBeenCalledWith({
        name: 'Skills Only Kit',
        description: undefined,
        policyId: undefined,
        loadoutId: 'loadout-a',
      })
    )
  })

  it('confirms before deleting a kit', async () => {
    actionMocks.actionKitDelete.mockResolvedValue(true)

    render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={kits}
        officialPresets={officialPresets}
        skills={hubSkills}
        projects={[]}
        agents={agents}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '删除 Kit' }))

    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '删除 Kit',
          type: 'danger',
          confirmText: '删除',
        })
      )
    )
    await waitFor(() => expect(actionMocks.actionKitDelete).toHaveBeenCalledWith('kit-a'))
  })

  it('keeps the kit form in new mode after clicking 新建', async () => {
    render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={kits}
        officialPresets={officialPresets}
        skills={hubSkills}
        projects={[]}
        agents={agents}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '新建' }))

    await waitFor(() => {
      expect((screen.getByPlaceholderText(/Kit 名称/) as HTMLInputElement).value).toBe('')
    })
    expect(
      (screen.getByPlaceholderText(/一句中文简介/) as HTMLTextAreaElement).value
    ).toBe('')
  })

  it('blocks deleting a skills package that is still used by a kit', async () => {
    render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={[
          {
            id: 'kit-web',
            name: 'Web Frontend Excellence',
            description: 'Uses the default package',
            policyId: 'policy-a',
            loadoutId: 'loadout-a',
            createdAt: now,
            updatedAt: now,
          },
        ]}
        officialPresets={officialPresets}
        skills={hubSkills}
        projects={[]}
        agents={agents}
      />
    )

    const deleteButton = screen.getByRole('button', { name: '删除skills 包' })
    fireEvent.click(deleteButton)

    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '无法删除skills 包',
          confirmText: '知道了',
          cancelText: '关闭',
          type: 'info',
        })
      )
    )
    expect(actionMocks.actionKitLoadoutDelete).not.toHaveBeenCalled()
  })

  it('blocks deleting an instruction template that is still used by a kit', async () => {
    render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={[
          {
            id: 'kit-web',
            name: 'Web Frontend Excellence',
            description: 'Uses the default template',
            policyId: 'policy-a',
            loadoutId: 'loadout-a',
            createdAt: now,
            updatedAt: now,
          },
        ]}
        officialPresets={officialPresets}
        skills={hubSkills}
        projects={[]}
        agents={agents}
      />
    )

    const deleteButton = screen.getByRole('button', { name: '删除Instruction 模板' })
    fireEvent.click(deleteButton)

    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '无法删除Instruction 模板',
          confirmText: '知道了',
          cancelText: '关闭',
          type: 'info',
        })
      )
    )
    expect(actionMocks.actionKitPolicyDelete).not.toHaveBeenCalled()
  })

  it('shows Claude-specific instruction filename in apply dialog and success message', async () => {
    const claudeAgents: AgentConfig[] = [
      {
        name: 'Claude Code',
        globalPath: '/tmp/.claude/skills',
        projectPath: '.claude/skills',
        instructionFileName: 'CLAUDE.md',
        enabled: true,
        isCustom: false,
      },
    ]

    const applyResult: KitApplyResult = {
      kitId: 'kit-a',
      kitName: 'Base Kit',
      policyPath: '/tmp/project/CLAUDE.md',
      policyFileName: 'CLAUDE.md',
      projectPath: '/tmp/project',
      agentName: 'Claude Code',
      appliedAt: now,
      overwroteAgentsMd: false,
      loadoutResults: [
        {
          skillPath: '/tmp/base-skill',
          mode: 'copy',
          destination: '/tmp/project/.claude/skills/base-skill',
          status: 'success',
        },
      ],
    }

    actionMocks.actionKitApply.mockResolvedValue(applyResult)

    render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={kits}
        officialPresets={officialPresets}
        skills={hubSkills}
        projects={['/tmp/project']}
        agents={claudeAgents}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '应用' }))

    expect(screen.getByText(/当前 Agent 会把模板写入项目根目录的/).textContent).toContain(
      'CLAUDE.md'
    )

    const applyButtons = screen.getAllByRole('button', { name: '应用' })
    fireEvent.click(applyButtons[applyButtons.length - 1])

    await waitFor(() =>
      expect(actionMocks.actionKitApply).toHaveBeenCalledWith({
        kitId: 'kit-a',
        projectPath: '/tmp/project',
        agentName: 'Claude Code',
        mode: 'copy',
        overwriteAgentsMd: false,
        includeSkills: [],
        excludeSkills: [],
      })
    )

    await waitFor(() =>
      expect(screen.getByText(/CLAUDE\.md 已写入/)).toBeTruthy()
    )
  })

  it('renders managed kits with a resync action in the saved kits list', async () => {
    const officialPresetEntries: OfficialPresetSummary[] = [
      {
        id: 'nextjs-product-delivery',
        name: 'Next.js Product Delivery',
        description: 'demo',
        policyName: 'Official: Next.js TS Strict',
        sourceCount: 1,
        skillCount: 2,
      },
    ]
    const managedKits: KitRecord[] = [
      {
        ...kits[0],
        id: 'kit-managed',
        name: 'Official: Next.js Product Delivery',
        managedSource: {
          kind: 'official_preset',
          presetId: 'nextjs-product-delivery',
          presetName: 'Next.js Product Delivery',
          catalogVersion: 2,
          installedAt: now,
          restoreCount: 0,
          baseline: {
            name: 'Official: Next.js Product Delivery',
            description: 'demo',
            policy: {
              id: 'policy-a',
              name: 'Official: Next.js TS Strict',
              description: 'demo policy',
              content: '# AGENTS.md\n',
            },
            loadout: {
              id: 'loadout-a',
              name: 'Official: Next.js Product Delivery',
              description: 'demo',
              items: loadouts[0].items,
            },
          },
          securityChecks: [],
        },
      },
    ]

    const view = render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={managedKits}
        officialPresets={officialPresetEntries}
        skills={hubSkills}
        projects={['/tmp/project']}
        agents={agents}
      />
    )

    expect(screen.getByText('Next.js Product Delivery')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新同步' })).toBeTruthy()

    view.unmount()
  })

  it('confirms before resyncing a managed kit', async () => {
    const officialPresetEntries: OfficialPresetSummary[] = [
      {
        id: 'nextjs-product-delivery',
        name: 'Next.js Product Delivery',
        description: 'demo',
        policyName: 'Official: Next.js TS Strict',
        sourceCount: 1,
        skillCount: 2,
      },
    ]
    const managedKits: KitRecord[] = [
      {
        ...kits[0],
        id: 'kit-managed',
        name: 'Official: Next.js Product Delivery',
        managedSource: {
          kind: 'official_preset',
          presetId: 'nextjs-product-delivery',
          presetName: 'Next.js Product Delivery',
          catalogVersion: 2,
          installedAt: now,
          restoreCount: 0,
          baseline: {
            name: 'Official: Next.js Product Delivery',
            description: 'demo',
            policy: {
              id: 'policy-a',
              name: 'Official: Next.js TS Strict',
              description: 'demo policy',
              content: '# AGENTS.md\n',
            },
            loadout: {
              id: 'loadout-a',
              name: 'Official: Next.js Product Delivery',
              description: 'demo',
              items: loadouts[0].items,
            },
          },
          securityChecks: [],
        },
      },
    ]

    actionMocks.actionOfficialPresetInstall.mockResolvedValue({
      preset: officialPresetEntries[0],
      policy: policies[0],
      loadout: loadouts[0],
      kit: managedKits[0],
      importedSources: [],
    })

    render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={managedKits}
        officialPresets={officialPresetEntries}
        skills={hubSkills}
        projects={['/tmp/project']}
        agents={agents}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '重新同步' }))

    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '重新同步 Kit',
          confirmText: '重新同步',
          cancelText: '取消',
          type: 'info',
        })
      )
    )
    await waitFor(() =>
      expect(actionMocks.actionOfficialPresetInstall).toHaveBeenCalledWith({
        id: 'nextjs-product-delivery',
        overwrite: true,
      })
    )
  })

  it('confirms before restoring a managed kit baseline', async () => {
    const managedKit: KitRecord = {
      ...kits[0],
      id: 'kit-managed',
      name: 'Official: Next.js Product Delivery',
      managedSource: {
        kind: 'official_preset',
        presetId: 'nextjs-product-delivery',
        presetName: 'Next.js Product Delivery',
        catalogVersion: 2,
        installedAt: now,
        restoreCount: 0,
        baseline: {
          name: 'Official: Next.js Product Delivery',
          description: 'demo',
          policy: {
            id: 'policy-a',
            name: 'Official: Next.js TS Strict',
            description: 'demo policy',
            content: '# AGENTS.md\n',
          },
          loadout: {
            id: 'loadout-a',
            name: 'Official: Next.js Product Delivery',
            description: 'demo',
            items: loadouts[0].items,
          },
        },
        securityChecks: [],
      },
    }

    actionMocks.actionKitRestoreManagedBaseline.mockResolvedValue(managedKit)

    render(
      <KitPanel
        policies={policies}
        loadouts={loadouts}
        kits={[managedKit]}
        officialPresets={[]}
        skills={hubSkills}
        projects={['/tmp/project']}
        agents={agents}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '恢复' }))

    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '恢复 Kit',
          confirmText: '恢复',
          cancelText: '取消',
          type: 'info',
        })
      )
    )
    await waitFor(() =>
      expect(actionMocks.actionKitRestoreManagedBaseline).toHaveBeenCalledWith('kit-managed')
    )
  })

  it('switches the current template and package when selecting a kit', async () => {
    render(
      <KitPanel
        policies={[
          ...policies,
          {
            id: 'policy-b',
            name: 'Advanced Policy',
            description: 'Secondary',
            content: '# CLAUDE.md\n',
            createdAt: now,
            updatedAt: now,
          },
        ]}
        loadouts={[
          ...loadouts,
          {
            id: 'loadout-b',
            name: 'Advanced Loadout',
            description: 'Secondary',
            items: [{ skillPath: '/tmp/advanced-skill', mode: 'copy', sortOrder: 0 }],
            createdAt: now,
            updatedAt: now,
          },
        ]}
        kits={[
          ...kits,
          {
            id: 'kit-b',
            name: 'Advanced Kit',
            description: 'Uses the secondary policy and package',
            policyId: 'policy-b',
            loadoutId: 'loadout-b',
            createdAt: now,
            updatedAt: now,
          },
        ]}
        officialPresets={officialPresets}
        skills={hubSkills}
        projects={[]}
        agents={agents}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Advanced Kit/ }))

    await waitFor(() => expect(screen.getByDisplayValue('Advanced Kit')).toBeTruthy())
    await waitFor(() =>
      expect(screen.getByTestId('policy-card-policy-b').className).toContain('border-[#e6b8a1]')
    )
    await waitFor(() =>
      expect(screen.getByTestId('loadout-card-loadout-b').className).toContain('border-[#e6b8a1]')
    )
    expect(scrollIntoViewMock).toHaveBeenCalled()

    const currentCombination = screen.getByText('当前组合').closest('.rounded-lg')
    expect(currentCombination).toBeTruthy()
    expect(within(currentCombination as HTMLElement).getByText('Advanced Policy')).toBeTruthy()
    expect(within(currentCombination as HTMLElement).getByText('Advanced Loadout')).toBeTruthy()
  })
})
