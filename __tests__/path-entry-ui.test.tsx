import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { SettingsModal } from '@/components/SettingsModal'
import { AgentManagerModal } from '@/components/AgentManagerModal'
import type { AppConfig } from '@/lib/config'

const { promptMock, confirmMock, actionMocks } = vi.hoisted(() => ({
  promptMock: vi.fn(),
  confirmMock: vi.fn(),
  actionMocks: {
    actionAddProject: vi.fn(),
    actionRemoveProject: vi.fn(),
    actionAddScanRoot: vi.fn(),
    actionRemoveScanRoot: vi.fn(),
    actionScanProjects: vi.fn(),
    actionAddScannedProjects: vi.fn(),
    actionPickDirectory: vi.fn(),
    actionUpdateAgentConfig: vi.fn(),
    actionRemoveAgentConfig: vi.fn(),
  },
}))

vi.mock('@/apps/desktop-ui/src/shims/link', () => ({
  default: ({ children }: { children: ReactNode }) => <a>{children}</a>,
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
  actionRemoveProject: actionMocks.actionRemoveProject,
  actionAddScanRoot: actionMocks.actionAddScanRoot,
  actionRemoveScanRoot: actionMocks.actionRemoveScanRoot,
  actionScanProjects: actionMocks.actionScanProjects,
  actionAddScannedProjects: actionMocks.actionAddScannedProjects,
  actionPickDirectory: actionMocks.actionPickDirectory,
  actionUpdateAgentConfig: actionMocks.actionUpdateAgentConfig,
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
})
