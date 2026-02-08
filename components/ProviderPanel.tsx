'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  actionProviderAdd,
  actionProviderDelete,
  actionProviderRestoreLatestBackup,
  actionProviderSwitch,
  actionProviderUpdate,
} from '@/app/actions'
import type { AppType, ProviderRecord } from '@/lib/core/provider-types'

type ProviderPanelProps = {
  providers: ProviderRecord[]
  currentProviders: Record<AppType, ProviderRecord | null>
}

const APPS: AppType[] = ['claude', 'codex', 'gemini']

const DEFAULT_CONFIGS: Record<AppType, string> = {
  claude: JSON.stringify({ model: 'claude-sonnet-4', api_key: 'sk-...' }, null, 2),
  codex: JSON.stringify(
    {
      auth: { api_key: 'sk-...' },
      configToml: { model: 'gpt-5', api_base_url: 'https://api.openai.com/v1' },
    },
    null,
    2
  ),
  gemini: JSON.stringify(
    {
      env: { GEMINI_API_KEY: '***' },
      settings: { model: 'gemini-2.5-pro' },
    },
    null,
    2
  ),
}

export function ProviderPanel({ providers, currentProviders }: ProviderPanelProps) {
  const router = useRouter()
  const [activeApp, setActiveApp] = useState<AppType>('claude')
  const [name, setName] = useState('')
  const [configText, setConfigText] = useState(DEFAULT_CONFIGS.claude)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const appProviders = useMemo(
    () => providers.filter((provider) => provider.appType === activeApp),
    [providers, activeApp]
  )

  const currentProvider = currentProviders[activeApp] || null

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setConfigText(DEFAULT_CONFIGS[activeApp])
  }

  const runAction = (action: () => Promise<void>) => {
    startTransition(async () => {
      try {
        setMessage(null)
        await action()
        router.refresh()
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  const handleSaveProvider = () => {
    runAction(async () => {
      const parsed = JSON.parse(configText)

      if (editingId) {
        await actionProviderUpdate({ id: editingId, name, config: parsed })
        setMessage({ type: 'success', text: 'Provider updated.' })
      } else {
        await actionProviderAdd({ appType: activeApp, name, config: parsed })
        setMessage({ type: 'success', text: 'Provider added.' })
      }

      resetForm()
    })
  }

  const handleEdit = (provider: ProviderRecord) => {
    setEditingId(provider.id)
    setName(provider.name)
    setConfigText(JSON.stringify(provider.config, null, 2))
  }

  const handleSwitch = (providerId: string) => {
    runAction(async () => {
      await actionProviderSwitch({ appType: activeApp, providerId })
      setMessage({ type: 'success', text: 'Provider switched successfully.' })
    })
  }

  const handleDelete = (providerId: string, providerName: string) => {
    if (!confirm(`Delete provider "${providerName}"?`)) return
    runAction(async () => {
      await actionProviderDelete(providerId)
      setMessage({ type: 'success', text: 'Provider deleted.' })
      if (editingId === providerId) resetForm()
    })
  }

  const handleRestore = () => {
    runAction(async () => {
      await actionProviderRestoreLatestBackup(activeApp)
      setMessage({ type: 'success', text: `Restored latest ${activeApp} backup.` })
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {APPS.map((appType) => (
          <button
            key={appType}
            onClick={() => {
              setActiveApp(appType)
              setConfigText(DEFAULT_CONFIGS[appType])
              setEditingId(null)
              setName('')
              setMessage(null)
            }}
            className={`px-3 py-1.5 rounded-md text-sm border ${
              activeApp === appType
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {appType}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 p-4 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Current provider</div>
            <div className="font-medium mt-1">{currentProvider?.name || 'Not selected'}</div>
          </div>
          <button
            onClick={handleRestore}
            disabled={isPending}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Restore latest backup
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 bg-white space-y-3">
        <div className="text-sm font-semibold">{editingId ? 'Edit provider' : 'Add provider'}</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Provider name"
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
        />
        <textarea
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-xs font-mono min-h-44"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveProvider}
            disabled={isPending || !name.trim()}
            className="px-3 py-1.5 text-sm rounded-md bg-[#d97757] text-white disabled:opacity-50"
          >
            {editingId ? 'Update provider' : 'Create provider'}
          </button>
          {editingId && (
            <button
              onClick={resetForm}
              disabled={isPending}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        {appProviders.length === 0 ? (
          <div className="text-sm text-gray-500">No providers configured for {activeApp}.</div>
        ) : (
          appProviders.map((provider) => (
            <div key={provider.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <span>{provider.name}</span>
                    {provider.isCurrent && (
                      <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                        current
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{provider.id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSwitch(provider.id)}
                    disabled={isPending || provider.isCurrent}
                    className="px-2.5 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Switch
                  </button>
                  <button
                    onClick={() => handleEdit(provider)}
                    disabled={isPending}
                    className="px-2.5 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(provider.id, provider.name)}
                    disabled={isPending}
                    className="px-2.5 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
