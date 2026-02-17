import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProviderPanel } from '@/components/ProviderPanel'
import type { ProviderRecord, UniversalProviderRecord } from '@/lib/core/provider-types'

const { confirmMock, actionMocks, refreshMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(),
  refreshMock: vi.fn(),
  actionMocks: {
    actionProviderAdd: vi.fn(),
    actionProviderCaptureLive: vi.fn(),
    actionProviderDelete: vi.fn(),
    actionProviderGetRaw: vi.fn(),
    actionProviderSwitch: vi.fn(),
    actionProviderUpdate: vi.fn(),
    actionUniversalProviderAdd: vi.fn(),
    actionUniversalProviderApply: vi.fn(),
    actionUniversalProviderDelete: vi.fn(),
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
    prompt: vi.fn(),
  }),
}))

vi.mock('@/apps/desktop-ui/src/tauri-actions', () => ({
  actionProviderAdd: actionMocks.actionProviderAdd,
  actionProviderCaptureLive: actionMocks.actionProviderCaptureLive,
  actionProviderDelete: actionMocks.actionProviderDelete,
  actionProviderGetRaw: actionMocks.actionProviderGetRaw,
  actionProviderSwitch: actionMocks.actionProviderSwitch,
  actionProviderUpdate: actionMocks.actionProviderUpdate,
  actionUniversalProviderAdd: actionMocks.actionUniversalProviderAdd,
  actionUniversalProviderApply: actionMocks.actionUniversalProviderApply,
  actionUniversalProviderDelete: actionMocks.actionUniversalProviderDelete,
}))

const now = 1_700_000_000_000

const codexProvider: ProviderRecord = {
  id: 'provider-codex-1',
  appType: 'codex',
  name: 'Codex Test Provider',
  config: {
    _profile: {
      kind: 'api',
      vendorKey: 'openai',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-5',
    },
  },
  isCurrent: true,
  createdAt: now,
  updatedAt: now,
}

const universalProvider: UniversalProviderRecord = {
  id: 'universal-1',
  name: 'Universal Test',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'or-test',
  apps: {
    claude: true,
    codex: true,
    gemini: false,
  },
  models: {
    codex: { model: 'openai/gpt-5' },
  },
  createdAt: now,
  updatedAt: now,
}

describe('ProviderPanel delete confirmation', () => {
  beforeEach(() => {
    cleanup()
    confirmMock.mockReset()
    refreshMock.mockReset()
    Object.values(actionMocks).forEach((mockFn) => mockFn.mockReset())
  })

  it('does not delete provider when confirmation is canceled', async () => {
    confirmMock.mockResolvedValue(false)

    render(
      <ProviderPanel
        providers={[codexProvider]}
        universalProviders={[]}
        currentProviders={{
          claude: null,
          codex: codexProvider,
          gemini: null,
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /删除/ }))

    await waitFor(() => expect(confirmMock).toHaveBeenCalled())
    expect(actionMocks.actionProviderDelete).not.toHaveBeenCalled()
  })

  it('deletes universal provider only after confirmation', async () => {
    confirmMock.mockResolvedValue(true)
    actionMocks.actionUniversalProviderDelete.mockResolvedValue(true)

    render(
      <ProviderPanel
        providers={[]}
        universalProviders={[universalProvider]}
        currentProviders={{
          claude: null,
          codex: null,
          gemini: null,
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /删除/ }))

    await waitFor(() =>
      expect(actionMocks.actionUniversalProviderDelete).toHaveBeenCalledWith(universalProvider.id)
    )
  })
})
