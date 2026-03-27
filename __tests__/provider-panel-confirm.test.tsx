import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProviderPanel } from '@/components/ProviderPanel'
import type { ProviderRecord, UniversalProviderRecord } from '@/lib/core/provider-types'

const { confirmMock, actionMocks, refreshMock } = vi.hoisted(() => ({
  confirmMock: vi.fn(),
  refreshMock: vi.fn(),
  actionMocks: {
    actionProviderAdd: vi.fn(),
    actionProviderCodexCaptureOfficial: vi.fn(),
    actionProviderCodexOfficialLoginStatus: vi.fn(),
    actionProviderCodexOpenLoginTerminal: vi.fn(),
    actionProviderCodexRefreshOfficial: vi.fn(),
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
  actionProviderCodexCaptureOfficial: actionMocks.actionProviderCodexCaptureOfficial,
  actionProviderCodexOfficialLoginStatus: actionMocks.actionProviderCodexOfficialLoginStatus,
  actionProviderCodexOpenLoginTerminal: actionMocks.actionProviderCodexOpenLoginTerminal,
  actionProviderCodexRefreshOfficial: actionMocks.actionProviderCodexRefreshOfficial,
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
    actionMocks.actionProviderCodexOfficialLoginStatus.mockResolvedValue({
      ready: false,
      message: '尚未检测到 Codex 官方登录态，请先在终端完成 codex logout / codex login。',
    })
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

  it('opens Codex official login terminal from the official account flow', async () => {
    actionMocks.actionProviderCodexOpenLoginTerminal.mockResolvedValue(true)

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

    fireEvent.click(screen.getByTitle('添加供应商'))
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI Official' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '打开终端登录 Codex 官方账号' })).toBeTruthy()
    )
    fireEvent.click(screen.getByRole('button', { name: '打开终端登录 Codex 官方账号' }))

    await waitFor(() =>
      expect(actionMocks.actionProviderCodexOpenLoginTerminal).toHaveBeenCalledTimes(1)
    )
  })

  it('keeps empty codex official config.toml empty when editing and saving', async () => {
    const officialProvider: ProviderRecord = {
      ...codexProvider,
      name: 'Codex Official',
      config: {
        _profile: {
          kind: 'official',
          vendorKey: 'openai-official',
          accountId: 'acc-1',
        },
        auth: {
          OPENAI_API_KEY: null,
          auth_mode: 'chatgpt',
          tokens: {
            account_id: 'acc-1',
          },
        },
        config: '',
      },
    }

    actionMocks.actionProviderGetRaw.mockResolvedValue(officialProvider)
    actionMocks.actionProviderUpdate.mockResolvedValue(officialProvider)

    const view = render(
      <ProviderPanel
        providers={[officialProvider]}
        universalProviders={[]}
        currentProviders={{
          claude: null,
          codex: officialProvider,
          gemini: null,
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '编辑供应商' }))

    await waitFor(() =>
      expect(actionMocks.actionProviderGetRaw).toHaveBeenCalledWith(officialProvider.id)
    )

    expect(screen.queryByText('编辑模式下会按这里的 JSON/TOML 内容保存该供应商。')).toBeNull()
    expect(screen.getByRole('button', { name: '查看 auth.json/config.toml' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '查看 auth.json/config.toml' }))

    const textareas = view.container.querySelectorAll('textarea')
    expect(textareas).toHaveLength(2)
    expect((textareas[1] as HTMLTextAreaElement).value).toBe('')
    expect((textareas[1] as HTMLTextAreaElement).value).not.toContain('your-api-endpoint.com')
  })

  it('refreshes codex official provider from current live config', async () => {
    const officialProvider: ProviderRecord = {
      ...codexProvider,
      name: 'Codex Official',
      config: {
        _profile: {
          kind: 'official',
          vendorKey: 'openai-official',
          accountId: 'acc-1',
        },
        auth: {
          OPENAI_API_KEY: null,
          auth_mode: 'chatgpt',
          tokens: {
            account_id: 'acc-1',
          },
        },
        config: '',
      },
    }
    const refreshedProvider: ProviderRecord = {
      ...officialProvider,
      config: {
        ...officialProvider.config,
        auth: {
          OPENAI_API_KEY: null,
          auth_mode: 'chatgpt',
          tokens: {
            account_id: 'acc-2',
          },
        },
        config: 'model = "gpt-5.4"\n',
        _profile: {
          kind: 'official',
          vendorKey: 'openai-official',
          accountId: 'acc-2',
        },
      },
    }

    actionMocks.actionProviderGetRaw.mockResolvedValue(officialProvider)
    actionMocks.actionProviderCodexRefreshOfficial.mockResolvedValue(refreshedProvider)

    render(
      <ProviderPanel
        providers={[officialProvider]}
        universalProviders={[]}
        currentProviders={{
          claude: null,
          codex: officialProvider,
          gemini: null,
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '编辑供应商' }))

    await waitFor(() =>
      expect(actionMocks.actionProviderGetRaw).toHaveBeenCalledWith(officialProvider.id)
    )

    fireEvent.click(screen.getByRole('button', { name: '从当前 Codex 刷新' }))

    await waitFor(() =>
      expect(actionMocks.actionProviderCodexRefreshOfficial).toHaveBeenCalledWith(officialProvider.id)
    )
    expect(screen.getByText('已从当前 Codex live 配置刷新该官方账号。')).toBeTruthy()
  })
})
