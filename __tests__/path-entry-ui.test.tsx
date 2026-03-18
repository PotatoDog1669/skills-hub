import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { SettingsModal } from '@/components/SettingsModal'
import { AgentManagerModal } from '@/components/AgentManagerModal'
import type { AppConfig } from '@/lib/config'

const { promptMock, confirmMock, actionMocks } = vi.hoisted(() => ({
  promptMock: vi.fn(),
  confirmMock: vi.fn(),
  actionMocks: {
    actionAddProject: vi.fn(),
    actionReorderProjects: vi.fn(),
    actionRemoveProject: vi.fn(),
    actionAddScanRoot: vi.fn(),
    actionRemoveScanRoot: vi.fn(),
    actionScanProjects: vi.fn(),
    actionAddScannedProjects: vi.fn(),
    actionPickDirectory: vi.fn(),
    actionUpdateAgentConfig: vi.fn(),
    actionReorderAgents: vi.fn(),
    actionRemoveAgentConfig: vi.fn(),
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
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ConfirmProvider', () => ({
  useConfirm: () => ({
    prompt: promptMock,
    confirm: confirmMock,
  }),
}))

vi.mock('@/apps/desktop-ui/src/tauri-actions', () => ({
  actionAddProject: actionMocks.actionAddProject,
  actionReorderProjects: actionMocks.actionReorderProjects,
  actionRemoveProject: actionMocks.actionRemoveProject,
  actionAddScanRoot: actionMocks.actionAddScanRoot,
  actionRemoveScanRoot: actionMocks.actionRemoveScanRoot,
  actionScanProjects: actionMocks.actionScanProjects,
  actionAddScannedProjects: actionMocks.actionAddScannedProjects,
  actionPickDirectory: actionMocks.actionPickDirectory,
  actionUpdateAgentConfig: actionMocks.actionUpdateAgentConfig,
  actionReorderAgents: actionMocks.actionReorderAgents,
  actionRemoveAgentConfig: actionMocks.actionRemoveAgentConfig,
}))

const baseConfig: AppConfig = {
  hubPath: '/tmp/hub',
  projects: [],
  scanRoots: [],
  agents: [],
}

describe('path entry UI', () => {
  beforeEach(() => {
    cleanup()
    Object.values(actionMocks).forEach((mockFn) => mockFn.mockReset())
    promptMock.mockReset()
    confirmMock.mockReset()
  })

  it('falls back to prompt when Sidebar picker is unsupported', async () => {
    actionMocks.actionPickDirectory.mockResolvedValue({
      status: 'unsupported',
      message: 'missing command',
    })
    promptMock.mockResolvedValue('/tmp/project-a')

    render(<Sidebar config={baseConfig} />)
    fireEvent.click(screen.getByTitle('Add manually'))

    await waitFor(() => expect(promptMock).toHaveBeenCalled())
    await waitFor(() => expect(actionMocks.actionAddProject).toHaveBeenCalledWith('/tmp/project-a'))
  })

  it('falls back to prompt when Settings picker is unsupported', async () => {
    actionMocks.actionPickDirectory.mockResolvedValue({
      status: 'unsupported',
      message: 'missing command',
    })
    promptMock.mockResolvedValue('/tmp/workspace-a')

    render(<SettingsModal config={baseConfig} isOpen={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByTitle('Add workspace'))

    await waitFor(() => expect(promptMock).toHaveBeenCalled())
    await waitFor(() =>
      expect(actionMocks.actionAddScanRoot).toHaveBeenCalledWith('/tmp/workspace-a')
    )
  })

  it('fills Global Path from picker in AgentManagerModal', async () => {
    actionMocks.actionPickDirectory.mockResolvedValue({
      status: 'selected',
      path: '/tmp/global-skills',
    })

    render(<AgentManagerModal config={baseConfig} isOpen={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Add New'))
    fireEvent.click(screen.getByText('Select Folder'))

    await waitFor(() => {
      const input = screen.getByPlaceholderText(
        'Global Path (~/path/to/skills)'
      ) as HTMLInputElement
      expect(input.value).toBe('/tmp/global-skills')
    })
  })

  it('confirms before removing a custom agent in AgentManagerModal', async () => {
    confirmMock.mockResolvedValue(true)

    render(
      <AgentManagerModal
        config={{
          ...baseConfig,
          agents: [
            {
              name: 'MyBot',
              globalPath: '/tmp/global-skills',
              projectPath: '.agent/skills',
              enabled: true,
              isCustom: true,
            },
          ],
        }}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTitle('Remove Agent'))

    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '删除自定义 Agent',
          type: 'danger',
          confirmText: '删除',
        })
      )
    )
    await waitFor(() => expect(actionMocks.actionRemoveAgentConfig).toHaveBeenCalledWith('MyBot'))
  })

  it('scans candidates and adds only selected projects in SettingsModal', async () => {
    actionMocks.actionScanProjects.mockResolvedValue(['/tmp/repo-a', '/tmp/repo-b'])
    actionMocks.actionAddScannedProjects.mockResolvedValue(1)

    render(<SettingsModal config={baseConfig} isOpen={true} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByText('Scan Now')[0])

    await waitFor(() => expect(actionMocks.actionScanProjects).toHaveBeenCalled())
    expect(screen.getByText('/tmp/repo-a')).toBeTruthy()
    expect(screen.getByText('/tmp/repo-b')).toBeTruthy()

    fireEvent.click(screen.getByText('/tmp/repo-b'))
    fireEvent.click(screen.getByText('Add Selected (1)'))

    await waitFor(() =>
      expect(actionMocks.actionAddScannedProjects).toHaveBeenCalledWith(['/tmp/repo-a'])
    )
  })

  it('renders the official logo asset for newly supported agents in Sidebar', () => {
    const config: AppConfig = {
      ...baseConfig,
      agents: [
        {
          name: 'Windsurf',
          globalPath: '/tmp/.codeium/windsurf/skills',
          projectPath: '.windsurf/skills',
          enabled: true,
          isCustom: false,
        },
      ],
    }

    const { container } = render(<Sidebar config={config} />)
    const logo = container.querySelector('img[src="/agent-logos/windsurf.svg"]')

    expect(logo).toBeTruthy()
  })

  it('renders the GitHub icon for GitHub Copilot', () => {
    const config: AppConfig = {
      ...baseConfig,
      agents: [
        {
          name: 'GitHub Copilot',
          globalPath: '/tmp/.copilot/skills',
          projectPath: '.github/skills',
          enabled: true,
          isCustom: false,
        },
      ],
    }

    render(<Sidebar config={config} />)

    expect(screen.getByTestId('agent-brand-github-copilot')).toBeTruthy()
  })

  it('reorders projects via drag and drop in Sidebar', async () => {
    const config: AppConfig = {
      ...baseConfig,
      projects: ['/tmp/repo-a', '/tmp/repo-b', '/tmp/repo-c'],
    }
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => '/tmp/repo-c'),
      effectAllowed: 'move',
      dropEffect: 'move',
    }

    render(<Sidebar config={config} />)

    fireEvent.dragStart(
      screen.getByTestId(`sidebar-project-${encodeURIComponent('/tmp/repo-c')}`),
      {
        dataTransfer,
      }
    )
    fireEvent.dragOver(screen.getByTestId(`sidebar-project-${encodeURIComponent('/tmp/repo-a')}`), {
      dataTransfer,
    })
    fireEvent.drop(screen.getByTestId(`sidebar-project-${encodeURIComponent('/tmp/repo-a')}`), {
      dataTransfer,
    })

    await waitFor(() =>
      expect(actionMocks.actionReorderProjects).toHaveBeenCalledWith([
        '/tmp/repo-c',
        '/tmp/repo-a',
        '/tmp/repo-b',
      ])
    )
  })

  it('reorders enabled agents via drag and drop in Sidebar', async () => {
    const config: AppConfig = {
      ...baseConfig,
      agents: [
        {
          name: 'Antigravity',
          globalPath: '/tmp/a',
          projectPath: '.agent/skills',
          enabled: true,
          isCustom: false,
        },
        {
          name: 'Cursor',
          globalPath: '/tmp/cursor',
          projectPath: '.cursor/skills',
          enabled: true,
          isCustom: false,
        },
        {
          name: 'Hidden Agent',
          globalPath: '/tmp/hidden',
          projectPath: '.hidden/skills',
          enabled: false,
          isCustom: true,
        },
        {
          name: 'Codex',
          globalPath: '/tmp/codex',
          projectPath: '.codex/skills',
          enabled: true,
          isCustom: false,
        },
      ],
    }
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => 'Codex'),
      effectAllowed: 'move',
      dropEffect: 'move',
    }

    render(<Sidebar config={config} />)

    fireEvent.dragStart(screen.getByTestId(`sidebar-agent-${encodeURIComponent('Codex')}`), {
      dataTransfer,
    })
    fireEvent.dragOver(screen.getByTestId(`sidebar-agent-${encodeURIComponent('Antigravity')}`), {
      dataTransfer,
    })
    fireEvent.drop(screen.getByTestId(`sidebar-agent-${encodeURIComponent('Antigravity')}`), {
      dataTransfer,
    })

    await waitFor(() =>
      expect(actionMocks.actionReorderAgents).toHaveBeenCalledWith([
        'Codex',
        'Antigravity',
        'Cursor',
      ])
    )
  })
})
