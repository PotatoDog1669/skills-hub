'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  actionProviderAdd,
  actionProviderCaptureLive,
  actionProviderDelete,
  actionProviderGetRaw,
  actionProviderRestoreLatestBackup,
  actionProviderSwitch,
  actionProviderUpdate,
  actionUniversalProviderAdd,
  actionUniversalProviderApply,
  actionUniversalProviderDelete,
} from '@/app/actions'
import type {
  AppType,
  ProviderProfile,
  ProviderRecord,
  UniversalProviderRecord,
} from '@/lib/core/provider-types'
import { ArrowLeft, Layers3, Plus, RefreshCw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'

type ProviderPanelProps = {
  providers: ProviderRecord[]
  universalProviders: UniversalProviderRecord[]
  currentProviders: Record<AppType, ProviderRecord | null>
}

type AppProviderMode = 'api' | 'official'
type AddDialogTab = 'app' | 'universal'

type AppProviderFormState = {
  name: string
  note: string
  website: string
  accountName: string
  apiKey: string
  endpoint: string
  model: string
}

type AppProviderPreset = {
  key: string
  label: string
  mode: AppProviderMode
  endpoint?: string
  model?: string
  website?: string
  description?: string
}

type UniversalProviderFormState = {
  name: string
  notes: string
  websiteUrl: string
  baseUrl: string
  apiKey: string
  apps: {
    claude: boolean
    codex: boolean
    gemini: boolean
  }
  models: {
    claude: string
    codex: string
    gemini: string
  }
}

const APPS: AppType[] = ['claude', 'codex', 'gemini']

const APP_LABEL: Record<AppType, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
}

const APP_PRESETS: Record<AppType, AppProviderPreset[]> = {
  claude: [
    {
      key: 'anthropic-official',
      label: 'Anthropic Official',
      mode: 'official',
      website: 'https://claude.ai',
      description: '官方供应商使用浏览器登录，无需配置 API Key',
    },
    {
      key: 'anthropic-api',
      label: 'Anthropic API',
      mode: 'api',
      endpoint: 'https://api.anthropic.com',
      model: 'claude-sonnet-4',
      website: 'https://console.anthropic.com',
    },
    {
      key: 'openrouter',
      label: 'OpenRouter',
      mode: 'api',
      endpoint: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-sonnet-4',
      website: 'https://openrouter.ai',
    },
    {
      key: 'custom',
      label: '自定义配置',
      mode: 'api',
      endpoint: 'https://your-api-endpoint.com/v1',
      model: 'claude-sonnet-4',
    },
  ],
  codex: [
    {
      key: 'custom',
      label: '自定义配置',
      mode: 'api',
      endpoint: 'https://your-api-endpoint.com/v1',
      model: 'gpt-5.2',
      description: '自定义配置需手动填写所有必要字段',
    },
    {
      key: 'openai-official',
      label: 'OpenAI Official',
      mode: 'official',
      website: 'https://chatgpt.com/codex',
      description: '官方供应商使用浏览器登录，无需配置 API Key',
    },
    {
      key: 'azure-openai',
      label: 'Azure OpenAI',
      mode: 'api',
      endpoint: 'https://YOUR_RESOURCE_NAME.openai.azure.com/openai',
      model: 'gpt-5.2',
      website: 'https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/codex',
    },
    {
      key: 'packycode',
      label: 'PackyCode',
      mode: 'api',
      endpoint: 'https://www.packyapi.com/v1',
      model: 'gpt-5.2',
      website: 'https://www.packyapi.com',
    },
    {
      key: 'cubence',
      label: 'Cubence',
      mode: 'api',
      endpoint: 'https://api.cubence.com/v1',
      model: 'gpt-5.2',
      website: 'https://cubence.com',
    },
    {
      key: 'aigocode',
      label: 'AIGoCode',
      mode: 'api',
      endpoint: 'https://api.aigocode.com',
      model: 'gpt-5.2',
      website: 'https://aigocode.com',
    },
    {
      key: 'rightcode',
      label: 'RightCode',
      mode: 'api',
      endpoint: 'https://right.codes/codex/v1',
      model: 'gpt-5.2',
      website: 'https://www.right.codes',
    },
    {
      key: 'aihubmix',
      label: 'AiHubMix',
      mode: 'api',
      endpoint: 'https://aihubmix.com/v1',
      model: 'gpt-5.2',
      website: 'https://aihubmix.com',
    },
    {
      key: 'dmxapi',
      label: 'DMXAPI',
      mode: 'api',
      endpoint: 'https://www.dmxapi.cn/v1',
      model: 'gpt-5.2',
      website: 'https://www.dmxapi.cn',
    },
    {
      key: 'openrouter',
      label: 'OpenRouter',
      mode: 'api',
      endpoint: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-5',
      website: 'https://openrouter.ai',
    },
    {
      key: 'aicodemirror',
      label: 'AICodeMirror',
      mode: 'api',
      endpoint: 'https://api.aicodemirror.com/api/codex/backend-api/codex',
      model: 'gpt-5.2',
      website: 'https://www.aicodemirror.com',
    },
  ],
  gemini: [
    {
      key: 'google-official',
      label: 'Gemini Official',
      mode: 'official',
      website: 'https://gemini.google.com',
      description: '官方供应商使用浏览器登录，无需配置 API Key',
    },
    {
      key: 'google-ai-studio',
      label: 'Google AI Studio API',
      mode: 'api',
      endpoint: 'https://generativelanguage.googleapis.com',
      model: 'gemini-2.5-pro',
      website: 'https://aistudio.google.com',
    },
    {
      key: 'openrouter',
      label: 'OpenRouter',
      mode: 'api',
      endpoint: 'https://openrouter.ai/api/v1',
      model: 'google/gemini-2.5-pro',
      website: 'https://openrouter.ai',
    },
    {
      key: 'custom',
      label: '自定义配置',
      mode: 'api',
      endpoint: 'https://your-api-endpoint.com/v1',
      model: 'gemini-2.5-pro',
    },
  ],
}

function emptyAppForm(appType: AppType): AppProviderFormState {
  if (appType === 'codex') {
    return {
      name: '',
      note: '',
      website: '',
      accountName: '',
      apiKey: '',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-5.2',
    }
  }

  if (appType === 'claude') {
    return {
      name: '',
      note: '',
      website: '',
      accountName: '',
      apiKey: '',
      endpoint: 'https://api.anthropic.com',
      model: 'claude-sonnet-4',
    }
  }

  return {
    name: '',
    note: '',
    website: '',
    accountName: '',
    apiKey: '',
    endpoint: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.5-pro',
  }
}

function emptyUniversalForm(): UniversalProviderFormState {
  return {
    name: '',
    notes: '',
    websiteUrl: '',
    baseUrl: '',
    apiKey: '',
    apps: {
      claude: true,
      codex: true,
      gemini: true,
    },
    models: {
      claude: 'claude-sonnet-4',
      codex: 'gpt-5.2',
      gemini: 'gemini-2.5-pro',
    },
  }
}

function getProfile(config: Record<string, unknown> | undefined): ProviderProfile {
  const profile = config?._profile
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return {}
  }
  return profile as ProviderProfile
}

function getProviderSubtitle(provider: ProviderRecord): string {
  const profile = getProfile(provider.config)
  if (profile.kind === 'official') {
    return profile.accountName || profile.note || 'Official account'
  }
  return profile.endpoint || profile.website || profile.note || provider.id
}

function extractAppFormState(
  appType: AppType,
  config: Record<string, unknown>
): Partial<AppProviderFormState> {
  const profile = getProfile(config)

  if (appType === 'codex') {
    const auth = (config.auth || {}) as Record<string, unknown>
    const cfg = (config.configToml || {}) as Record<string, unknown>
    return {
      apiKey: typeof auth.api_key === 'string' ? auth.api_key : '',
      endpoint: typeof cfg.api_base_url === 'string' ? cfg.api_base_url : '',
      model: typeof cfg.model === 'string' ? cfg.model : '',
      accountName: profile.accountName || '',
      website: profile.website || '',
      note: profile.note || '',
    }
  }

  if (appType === 'claude') {
    return {
      apiKey: typeof config.api_key === 'string' ? String(config.api_key) : '',
      endpoint: typeof config.api_base_url === 'string' ? String(config.api_base_url) : '',
      model: typeof config.model === 'string' ? String(config.model) : '',
      accountName: profile.accountName || '',
      website: profile.website || '',
      note: profile.note || '',
    }
  }

  const env = (config.env || {}) as Record<string, unknown>
  const settings = (config.settings || {}) as Record<string, unknown>
  return {
    apiKey: typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY : '',
    endpoint: typeof settings.api_base_url === 'string' ? String(settings.api_base_url) : '',
    model: typeof settings.model === 'string' ? String(settings.model) : '',
    accountName: profile.accountName || '',
    website: profile.website || '',
    note: profile.note || '',
  }
}

function buildApiConfig(appType: AppType, form: AppProviderFormState, profile: ProviderProfile) {
  if (appType === 'codex') {
    return {
      _profile: profile,
      auth: {
        api_key: form.apiKey,
      },
      configToml: {
        model: form.model,
        ...(form.endpoint.trim() ? { api_base_url: form.endpoint.trim() } : {}),
      },
    }
  }

  if (appType === 'claude') {
    return {
      _profile: profile,
      api_key: form.apiKey,
      model: form.model,
      ...(form.endpoint.trim() ? { api_base_url: form.endpoint.trim() } : {}),
    }
  }

  return {
    _profile: profile,
    env: {
      GEMINI_API_KEY: form.apiKey,
    },
    settings: {
      model: form.model,
      ...(form.endpoint.trim() ? { api_base_url: form.endpoint.trim() } : {}),
    },
  }
}

export function ProviderPanel({
  providers,
  universalProviders,
  currentProviders,
}: ProviderPanelProps) {
  const router = useRouter()

  const [activeApp, setActiveApp] = useState<AppType>('codex')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogTab, setDialogTab] = useState<AddDialogTab>('app')
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [appProviderMode, setAppProviderMode] = useState<AppProviderMode>('api')
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('custom')
  const [appForm, setAppForm] = useState<AppProviderFormState>(() => emptyAppForm('codex'))
  const [universalForm, setUniversalForm] = useState<UniversalProviderFormState>(() =>
    emptyUniversalForm()
  )
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const appProviders = useMemo(
    () => providers.filter((provider) => provider.appType === activeApp),
    [providers, activeApp]
  )

  const currentProvider = currentProviders[activeApp]

  const runMutation = (mutation: () => Promise<void>) => {
    startTransition(async () => {
      try {
        setMessage(null)
        await mutation()
        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  const resetAppForm = (appType = activeApp) => {
    setEditingProviderId(null)
    setSelectedPresetKey('custom')
    setAppProviderMode('api')
    setAppForm(emptyAppForm(appType))
  }

  const resetUniversalForm = () => {
    setUniversalForm(emptyUniversalForm())
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setDialogTab('app')
    resetAppForm()
    resetUniversalForm()
  }

  const openCreateDialog = () => {
    setDialogTab('app')
    resetAppForm(activeApp)
    resetUniversalForm()
    setDialogOpen(true)
  }

  const handleSwitchProvider = (providerId: string) => {
    runMutation(async () => {
      await actionProviderSwitch({ appType: activeApp, providerId })
      setMessage({ type: 'success', text: '已切换当前供应商。' })
    })
  }

  const handleDeleteProvider = (providerId: string, providerName: string) => {
    if (!confirm(`删除供应商「${providerName}」？`)) return

    runMutation(async () => {
      await actionProviderDelete(providerId)
      setMessage({ type: 'success', text: '供应商已删除。' })
      if (editingProviderId === providerId) {
        resetAppForm(activeApp)
      }
    })
  }

  const handleRestoreBackup = () => {
    runMutation(async () => {
      await actionProviderRestoreLatestBackup(activeApp)
      setMessage({ type: 'success', text: `${APP_LABEL[activeApp]} 已恢复最近备份。` })
    })
  }

  const handleApplyPreset = (preset: AppProviderPreset) => {
    setSelectedPresetKey(preset.key)
    setAppProviderMode(preset.mode)
    setAppForm((prev) => ({
      ...prev,
      name: editingProviderId ? prev.name : prev.name || preset.label,
      website: preset.website || prev.website,
      endpoint: preset.endpoint || prev.endpoint,
      model: preset.model || prev.model,
    }))
  }

  const handleEditProvider = (provider: ProviderRecord) => {
    startTransition(async () => {
      try {
        const raw = await actionProviderGetRaw(provider.id)
        const profile = getProfile(raw.config)
        const extracted = extractAppFormState(provider.appType, raw.config)

        setActiveApp(provider.appType)
        setEditingProviderId(raw.id)
        setSelectedPresetKey(profile.vendorKey || 'custom')
        setAppProviderMode(profile.kind === 'official' ? 'official' : 'api')
        setAppForm({
          ...emptyAppForm(provider.appType),
          name: raw.name,
          ...extracted,
        })
        setDialogTab('app')
        setDialogOpen(true)
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  const handleSubmitAppProvider = () => {
    if (!appForm.name.trim()) {
      setMessage({ type: 'error', text: '供应商名称不能为空。' })
      return
    }

    if (appProviderMode === 'api' && !appForm.apiKey.trim()) {
      setMessage({ type: 'error', text: 'API 供应商必须填写 API Key。' })
      return
    }

    runMutation(async () => {
      if (appProviderMode === 'official') {
        if (editingProviderId) {
          const raw = await actionProviderGetRaw(editingProviderId)
          const existingProfile = getProfile(raw.config)
          await actionProviderUpdate({
            id: editingProviderId,
            name: appForm.name.trim(),
            config: {
              ...raw.config,
              _profile: {
                ...existingProfile,
                kind: 'official',
                vendorKey: selectedPresetKey === 'custom' ? undefined : selectedPresetKey,
                accountName: appForm.accountName.trim() || undefined,
                website: appForm.website.trim() || undefined,
                note: appForm.note.trim() || undefined,
              },
            },
          })
          setMessage({ type: 'success', text: '官方账号已更新。' })
        } else {
          await actionProviderCaptureLive({
            appType: activeApp,
            name: appForm.name.trim(),
            profile: {
              kind: 'official',
              vendorKey: selectedPresetKey === 'custom' ? undefined : selectedPresetKey,
              accountName: appForm.accountName.trim() || undefined,
              website: appForm.website.trim() || undefined,
              note: appForm.note.trim() || undefined,
            },
          })
          setMessage({ type: 'success', text: '已捕获当前本地登录配置为官方账号。' })
        }
      } else {
        const profile: ProviderProfile = {
          kind: 'api',
          vendorKey: selectedPresetKey === 'custom' ? undefined : selectedPresetKey,
          accountName: appForm.accountName.trim() || undefined,
          website: appForm.website.trim() || undefined,
          endpoint: appForm.endpoint.trim() || undefined,
          model: appForm.model.trim() || undefined,
          note: appForm.note.trim() || undefined,
        }

        const nextConfig = buildApiConfig(activeApp, appForm, profile)

        if (editingProviderId) {
          await actionProviderUpdate({
            id: editingProviderId,
            name: appForm.name.trim(),
            config: nextConfig,
          })
          setMessage({ type: 'success', text: 'API 供应商已更新。' })
        } else {
          await actionProviderAdd({
            appType: activeApp,
            name: appForm.name.trim(),
            config: nextConfig,
          })
          setMessage({ type: 'success', text: 'API 供应商已添加。' })
        }
      }

      closeDialog()
    })
  }

  const handleSubmitUniversalProvider = () => {
    if (
      !universalForm.name.trim() ||
      !universalForm.baseUrl.trim() ||
      !universalForm.apiKey.trim()
    ) {
      setMessage({ type: 'error', text: '统一供应商必须填写名称、API 请求地址、API Key。' })
      return
    }

    if (!universalForm.apps.claude && !universalForm.apps.codex && !universalForm.apps.gemini) {
      setMessage({ type: 'error', text: '至少启用一个应用。' })
      return
    }

    runMutation(async () => {
      const created = await actionUniversalProviderAdd({
        name: universalForm.name.trim(),
        baseUrl: universalForm.baseUrl.trim(),
        apiKey: universalForm.apiKey.trim(),
        websiteUrl: universalForm.websiteUrl.trim() || undefined,
        notes: universalForm.notes.trim() || undefined,
        apps: universalForm.apps,
        models: {
          claude: { model: universalForm.models.claude.trim() || undefined },
          codex: { model: universalForm.models.codex.trim() || undefined },
          gemini: { model: universalForm.models.gemini.trim() || undefined },
        },
      })

      const applied = await actionUniversalProviderApply(created.id)
      setMessage({
        type: 'success',
        text: `统一供应商已创建，并同步生成 ${applied.length} 个应用供应商。`,
      })
      closeDialog()
    })
  }

  const handleApplyUniversal = (provider: UniversalProviderRecord) => {
    runMutation(async () => {
      const applied = await actionUniversalProviderApply(provider.id)
      setMessage({
        type: 'success',
        text: `已将「${provider.name}」同步到 ${applied.length} 个应用供应商。`,
      })
    })
  }

  const handleDeleteUniversal = (provider: UniversalProviderRecord) => {
    if (!confirm(`删除统一供应商「${provider.name}」？`)) return

    runMutation(async () => {
      await actionUniversalProviderDelete(provider.id)
      setMessage({ type: 'success', text: '统一供应商已删除。' })
    })
  }

  const selectedPreset = APP_PRESETS[activeApp].find((preset) => preset.key === selectedPresetKey)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2">
          {APPS.map((appType) => (
            <button
              key={appType}
              onClick={() => {
                setActiveApp(appType)
                setMessage(null)
                resetAppForm(appType)
              }}
              className={`rounded-xl px-4 py-2 text-sm border ${
                activeApp === appType
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {APP_LABEL[appType]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRestoreBackup}
            disabled={isPending}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <RefreshCw size={14} /> 恢复备份
          </button>
          <button
            onClick={openCreateDialog}
            disabled={isPending}
            className="h-10 w-10 rounded-full bg-[#f97316] text-white shadow hover:bg-[#ea580c] disabled:opacity-50 inline-flex items-center justify-center"
            title="添加供应商"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="text-sm text-gray-500">当前供应商</div>
        <div className="mt-1 text-lg font-semibold">{currentProvider?.name || '未选择'}</div>
        {currentProvider && (
          <div className="mt-1 text-sm text-gray-500">{getProviderSubtitle(currentProvider)}</div>
        )}
      </div>

      {message && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {appProviders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
            当前 {APP_LABEL[activeApp]} 还没有可切换供应商。
          </div>
        ) : (
          appProviders.map((provider) => (
            <div
              key={provider.id}
              className={`rounded-2xl border p-4 bg-white ${
                provider.isCurrent ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-2xl font-semibold leading-none">
                    <span className="text-base font-semibold">{provider.name}</span>
                    {provider.isCurrent && (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        <Sparkles size={12} /> current
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-gray-600">{getProviderSubtitle(provider)}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSwitchProvider(provider.id)}
                    disabled={isPending || provider.isCurrent}
                    className="rounded border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    切换
                  </button>
                  <button
                    onClick={() => handleEditProvider(provider)}
                    disabled={isPending}
                    className="rounded border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDeleteProvider(provider.id, provider.name)}
                    disabled={isPending}
                    className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Layers3 size={16} /> 统一供应商
        </div>

        {universalProviders.length === 0 ? (
          <div className="text-sm text-gray-500">
            还没有统一供应商。点击右上角 + 可创建并一键同步到多应用。
          </div>
        ) : (
          universalProviders.map((provider) => (
            <div key={provider.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{provider.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{provider.baseUrl}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {provider.apps.claude && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        Claude
                      </span>
                    )}
                    {provider.apps.codex && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        Codex
                      </span>
                    )}
                    {provider.apps.gemini && (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        Gemini
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApplyUniversal(provider)}
                    disabled={isPending}
                    className="rounded border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    同步
                  </button>
                  <button
                    onClick={() => handleDeleteUniversal(provider)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[1px]"
          onClick={closeDialog}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={closeDialog}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
                  title="返回"
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <div className="text-3xl font-semibold">添加新供应商</div>
                  <div className="text-sm text-gray-500">当前应用: {APP_LABEL[activeApp]}</div>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
                <button
                  onClick={() => setDialogTab('app')}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    dialogTab === 'app' ? 'bg-[#2583e7] text-white' : 'text-gray-500'
                  }`}
                >
                  {APP_LABEL[activeApp]} 供应商
                </button>
                <button
                  onClick={() => setDialogTab('universal')}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    dialogTab === 'universal' ? 'bg-[#2583e7] text-white' : 'text-gray-500'
                  }`}
                >
                  统一供应商
                </button>
              </div>

              {dialogTab === 'app' ? (
                <div className="space-y-4 rounded-xl border border-gray-200 p-5">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">预设供应商</div>
                    <div className="flex flex-wrap gap-2">
                      {APP_PRESETS[activeApp].map((preset) => (
                        <button
                          key={preset.key}
                          onClick={() => handleApplyPreset(preset)}
                          className={`rounded-xl px-4 py-2 text-sm border ${
                            selectedPresetKey === preset.key
                              ? 'border-gray-800 bg-gray-900 text-white'
                              : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    {selectedPreset?.description && (
                      <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        {selectedPreset.description}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={appForm.name}
                      onChange={(event) =>
                        setAppForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="供应商名称"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={appForm.note}
                      onChange={(event) =>
                        setAppForm((prev) => ({ ...prev, note: event.target.value }))
                      }
                      placeholder="备注（可选）"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={appForm.website}
                      onChange={(event) =>
                        setAppForm((prev) => ({ ...prev, website: event.target.value }))
                      }
                      placeholder="官网链接（可选）"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm md:col-span-2"
                    />

                    {appProviderMode === 'official' ? (
                      <>
                        <input
                          value={appForm.accountName}
                          onChange={(event) =>
                            setAppForm((prev) => ({ ...prev, accountName: event.target.value }))
                          }
                          placeholder="账号备注（如：公司账号）"
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm md:col-span-2"
                        />
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 md:col-span-2">
                          请先在本机完成 {APP_LABEL[activeApp]} 登录，再点击添加以捕获当前 live
                          配置。
                        </div>
                      </>
                    ) : (
                      <>
                        <input
                          value={appForm.apiKey}
                          onChange={(event) =>
                            setAppForm((prev) => ({ ...prev, apiKey: event.target.value }))
                          }
                          placeholder="API Key"
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm md:col-span-2"
                        />
                        <input
                          value={appForm.endpoint}
                          onChange={(event) =>
                            setAppForm((prev) => ({ ...prev, endpoint: event.target.value }))
                          }
                          placeholder="API 请求地址"
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                        />
                        <input
                          value={appForm.model}
                          onChange={(event) =>
                            setAppForm((prev) => ({ ...prev, model: event.target.value }))
                          }
                          placeholder="模型名称"
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                        />
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 md:col-span-2">
                          填写兼容 OpenAI Responses 格式的 API 请求地址。
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 rounded-xl border border-gray-200 p-5">
                  <div className="text-sm text-gray-600">
                    统一供应商会保存一份 API 网关配置，并一键同步为 Claude / Codex / Gemini
                    的可切换供应商。
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={universalForm.name}
                      onChange={(event) =>
                        setUniversalForm((prev) => ({ ...prev, name: event.target.value }))
                      }
                      placeholder="供应商名称"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={universalForm.notes}
                      onChange={(event) =>
                        setUniversalForm((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      placeholder="备注（可选）"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={universalForm.websiteUrl}
                      onChange={(event) =>
                        setUniversalForm((prev) => ({ ...prev, websiteUrl: event.target.value }))
                      }
                      placeholder="官网链接（可选）"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm md:col-span-2"
                    />
                    <input
                      value={universalForm.apiKey}
                      onChange={(event) =>
                        setUniversalForm((prev) => ({ ...prev, apiKey: event.target.value }))
                      }
                      placeholder="API Key"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm md:col-span-2"
                    />
                    <input
                      value={universalForm.baseUrl}
                      onChange={(event) =>
                        setUniversalForm((prev) => ({ ...prev, baseUrl: event.target.value }))
                      }
                      placeholder="API 请求地址"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm md:col-span-2"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-medium">启用应用</div>
                    <div className="grid gap-2 md:grid-cols-3">
                      {APPS.map((appType) => (
                        <label
                          key={appType}
                          className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={universalForm.apps[appType]}
                            onChange={(event) =>
                              setUniversalForm((prev) => ({
                                ...prev,
                                apps: {
                                  ...prev.apps,
                                  [appType]: event.target.checked,
                                },
                              }))
                            }
                          />
                          {APP_LABEL[appType]}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-medium">模型配置</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {APPS.map((appType) => (
                        <input
                          key={appType}
                          value={universalForm.models[appType]}
                          onChange={(event) =>
                            setUniversalForm((prev) => ({
                              ...prev,
                              models: {
                                ...prev.models,
                                [appType]: event.target.value,
                              },
                            }))
                          }
                          placeholder={`${APP_LABEL[appType]} 模型`}
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                onClick={closeDialog}
                disabled={isPending}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>

              {dialogTab === 'app' ? (
                <button
                  onClick={handleSubmitAppProvider}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#2583e7] px-4 py-2 text-sm text-white hover:bg-[#1b74d2] disabled:opacity-50"
                >
                  {appProviderMode === 'official' ? <ShieldCheck size={14} /> : <Plus size={14} />}
                  {editingProviderId ? '保存' : '添加'}
                </button>
              ) : (
                <button
                  onClick={handleSubmitUniversalProvider}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#2583e7] px-4 py-2 text-sm text-white hover:bg-[#1b74d2] disabled:opacity-50"
                >
                  <Plus size={14} /> 添加
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
