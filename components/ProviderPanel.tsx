'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from '@/apps/desktop-ui/src/shims/navigation'
import { useConfirm } from '@/components/ConfirmProvider'
import {
  actionProviderAdd,
  actionProviderCaptureLive,
  actionProviderDelete,
  actionProviderGetRaw,
  actionProviderSwitch,
  actionProviderUpdate,
  actionUniversalProviderAdd,
  actionUniversalProviderApply,
  actionUniversalProviderDelete,
} from '@/apps/desktop-ui/src/tauri-actions'
import type {
  AppType,
  ProviderProfile,
  ProviderRecord,
  UniversalProviderRecord,
} from '@/lib/core/provider-types'
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Layers3,
  Pencil,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'

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

const CLAUDE_ICON_PATH =
  'M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z'

const CODEX_ICON_PATH =
  'M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z'

const GEMINI_ICON_PATH =
  'M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z'

function AppTypeIcon({
  appType,
  active = false,
  className = 'h-4 w-4 shrink-0',
}: {
  appType: AppType
  active?: boolean
  className?: string
}) {
  if (appType === 'claude') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d={CLAUDE_ICON_PATH} fill={active ? '#ffffff' : '#D97757'} />
      </svg>
    )
  }

  if (appType === 'codex') {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path d={CODEX_ICON_PATH} fillRule="evenodd" fill={active ? '#ffffff' : '#111827'} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient
          id="provider-gemini-fill-0"
          gradientUnits="userSpaceOnUse"
          x1="7"
          y1="15.5"
          x2="11"
          y2="12"
        >
          <stop stopColor="#08B962" />
          <stop offset="1" stopColor="#08B962" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="provider-gemini-fill-1"
          gradientUnits="userSpaceOnUse"
          x1="8"
          y1="5.5"
          x2="11.5"
          y2="11"
        >
          <stop stopColor="#F94543" />
          <stop offset="1" stopColor="#F94543" stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id="provider-gemini-fill-2"
          gradientUnits="userSpaceOnUse"
          x1="3.5"
          y1="13.5"
          x2="17.5"
          y2="12"
        >
          <stop stopColor="#FABC12" />
          <stop offset="0.46" stopColor="#FABC12" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={GEMINI_ICON_PATH} fill="#3186FF" />
      <path d={GEMINI_ICON_PATH} fill="url(#provider-gemini-fill-0)" />
      <path d={GEMINI_ICON_PATH} fill="url(#provider-gemini-fill-1)" />
      <path d={GEMINI_ICON_PATH} fill="url(#provider-gemini-fill-2)" />
    </svg>
  )
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeCodexProviderKey(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || 'custom'
}

function normalizeTomlTextWithEol(value: string): string {
  return value.endsWith('\n') ? value : `${value}\n`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripTomlComment(value: string): string {
  let inSingle = false
  let inDouble = false
  let escaped = false

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && inDouble) {
      escaped = true
      continue
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble
      continue
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle
      continue
    }
    if (char === '#' && !inSingle && !inDouble) {
      return value.slice(0, index)
    }
  }

  return value
}

function decodeTomlString(rawValue: string): string {
  const value = rawValue.trim()
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1')
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1)
  }
  return value
}

function extractTomlScalarString(source: string, key: string): string {
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.+?)\\s*$`, 'm')
  const matched = source.match(pattern)
  if (!matched) return ''

  const withoutComment = stripTomlComment(matched[1]).trim()
  if (!withoutComment) return ''
  return decodeTomlString(withoutComment)
}

function extractTomlSection(source: string, sectionName: string): string {
  const headerPattern = new RegExp(`^\\s*\\[\\s*${escapeRegExp(sectionName)}\\s*\\]\\s*$`, 'm')
  const header = headerPattern.exec(source)
  if (!header) return ''

  const sectionStart = header.index + header[0].length
  const remainder = source.slice(sectionStart)
  const nextHeaderOffset = remainder.search(/^\s*\[[^\]]+\]\s*$/m)
  if (nextHeaderOffset === -1) {
    return remainder
  }
  return remainder.slice(0, nextHeaderOffset)
}

function extractCodexEndpointFromTomlText(configText: string): string {
  const directApiBase = extractTomlScalarString(configText, 'api_base_url')
  if (directApiBase) return directApiBase

  const directBaseUrl = extractTomlScalarString(configText, 'base_url')
  if (directBaseUrl) return directBaseUrl

  const preferredProvider = extractTomlScalarString(configText, 'model_provider')
  if (preferredProvider) {
    const preferredSection = extractTomlSection(configText, `model_providers.${preferredProvider}`)
    const preferredBaseUrl = extractTomlScalarString(preferredSection, 'base_url')
    if (preferredBaseUrl) return preferredBaseUrl
  }

  const sectionHeaders = configText.matchAll(/^\s*\[\s*model_providers\.([^\]]+)\s*\]\s*$/gm)
  for (const headerMatch of sectionHeaders) {
    const providerKey = headerMatch[1]?.trim()
    if (!providerKey) continue
    const sectionText = extractTomlSection(configText, `model_providers.${providerKey}`)
    const sectionBaseUrl = extractTomlScalarString(sectionText, 'base_url')
    if (sectionBaseUrl) return sectionBaseUrl
  }

  return ''
}

function extractCodexModelFromTomlText(configText: string): string {
  return extractTomlScalarString(configText, 'model')
}

function getCodexEndpointFromTomlObject(value: Record<string, unknown>): string {
  if (typeof value.api_base_url === 'string') return value.api_base_url
  if (typeof value.base_url === 'string') return value.base_url

  const modelProviders = value.model_providers
  if (isObjectRecord(modelProviders)) {
    const preferredProvider =
      typeof value.model_provider === 'string' ? value.model_provider : undefined

    if (preferredProvider && isObjectRecord(modelProviders[preferredProvider])) {
      const preferredConfig = modelProviders[preferredProvider] as Record<string, unknown>
      if (typeof preferredConfig.base_url === 'string') return preferredConfig.base_url
    }

    for (const config of Object.values(modelProviders)) {
      if (isObjectRecord(config) && typeof config.base_url === 'string') {
        return config.base_url
      }
    }
  }

  return ''
}

function parseCodexTomlInfo(
  configValue: unknown,
  fallbackEndpoint: string,
  fallbackModel: string
): { endpoint: string; model: string; configText: string } {
  if (typeof configValue === 'string') {
    const configText = configValue.trim() ? normalizeTomlTextWithEol(configValue) : ''
    return {
      endpoint: extractCodexEndpointFromTomlText(configText) || fallbackEndpoint,
      model: extractCodexModelFromTomlText(configText) || fallbackModel,
      configText,
    }
  }

  if (isObjectRecord(configValue)) {
    const endpoint = getCodexEndpointFromTomlObject(configValue)
    const model = typeof configValue.model === 'string' ? configValue.model : ''
    return {
      endpoint: endpoint || fallbackEndpoint,
      model: model || fallbackModel,
      configText: '',
    }
  }

  return {
    endpoint: fallbackEndpoint,
    model: fallbackModel,
    configText: '',
  }
}

function getProviderSubtitle(provider: ProviderRecord): string {
  const profile = getProfile(provider.config)
  const looksOfficialByName = provider.name.toLowerCase().includes('official')
  const auth = isObjectRecord(provider.config?.auth)
    ? (provider.config.auth as Record<string, unknown>)
    : null
  const looksOfficialByAuth =
    Boolean(auth && isObjectRecord(auth.tokens)) || Boolean(auth && auth.auth_mode === 'chatgpt')
  const isOfficial = profile.kind === 'official' || looksOfficialByName || looksOfficialByAuth

  if (isOfficial) {
    if (profile.accountName && profile.note) {
      return `${profile.accountName} · ${profile.note}`
    }
    return profile.note || profile.accountName || 'Official account'
  }
  return profile.note || profile.endpoint || profile.website || ''
}

function getProviderSwitchToastText(provider: ProviderRecord): string {
  const profile = getProfile(provider.config)
  const note = profile.note?.trim()
  if (note) {
    return `已切换到${provider.name}/${note}。`
  }
  return `已切换到${provider.name}。`
}

function extractAppFormState(
  appType: AppType,
  config: Record<string, unknown>
): Partial<AppProviderFormState> {
  const profile = getProfile(config)

  if (appType === 'codex') {
    const auth = (config.auth || {}) as Record<string, unknown>
    const tomlInfo = parseCodexTomlInfo(
      config.config ?? config.configToml,
      '',
      typeof profile.model === 'string' ? profile.model : ''
    )
    return {
      apiKey:
        typeof auth.OPENAI_API_KEY === 'string'
          ? auth.OPENAI_API_KEY
          : typeof auth.api_key === 'string'
            ? auth.api_key
            : '',
      endpoint: tomlInfo.endpoint,
      model: tomlInfo.model,
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

function buildApiConfig(
  appType: AppType,
  form: AppProviderFormState,
  profile: ProviderProfile,
  codexProviderKey = 'custom'
) {
  if (appType === 'codex') {
    return {
      _profile: profile,
      auth: {
        OPENAI_API_KEY: form.apiKey,
      },
      config: buildCodexConfigTomlText(form.endpoint, form.model, codexProviderKey),
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

function buildCodexAuthJsonText(apiKey: string): string {
  return `${JSON.stringify({ OPENAI_API_KEY: apiKey || '' }, null, 2)}\n`
}

function buildCodexConfigTomlText(endpoint: string, model: string, providerKey = 'custom'): string {
  const modelName = (model || 'gpt-5.2').trim() || 'gpt-5.2'
  const baseUrl =
    (endpoint || 'https://your-api-endpoint.com/v1').trim() || 'https://your-api-endpoint.com/v1'
  const normalizedProviderKey = sanitizeCodexProviderKey(providerKey)
  return [
    `model_provider = "${normalizedProviderKey}"`,
    `model = "${modelName}"`,
    'model_reasoning_effort = "high"',
    'disable_response_storage = true',
    '',
    `[model_providers.${normalizedProviderKey}]`,
    `name = "${normalizedProviderKey}"`,
    `base_url = "${baseUrl}"`,
    'wire_api = "responses"',
    'requires_openai_auth = true',
    '',
  ].join('\n')
}

function stringifyCodexAuthJson(auth: unknown, fallbackApiKey: string): string {
  if (!isObjectRecord(auth)) {
    return buildCodexAuthJsonText(fallbackApiKey)
  }
  return `${JSON.stringify(auth, null, 2)}\n`
}

function stringifyCodexConfigToml(
  configValue: unknown,
  fallbackEndpoint: string,
  fallbackModel: string
): string {
  const info = parseCodexTomlInfo(configValue, fallbackEndpoint, fallbackModel)
  if (info.configText) {
    return info.configText
  }
  return buildCodexConfigTomlText(fallbackEndpoint, fallbackModel)
}

export function ProviderPanel({
  providers,
  universalProviders,
  currentProviders,
}: ProviderPanelProps) {
  const router = useRouter()
  const { confirm: confirmDialog } = useConfirm()

  const [activeApp, setActiveApp] = useState<AppType>('codex')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogTab, setDialogTab] = useState<AddDialogTab>('app')
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [appProviderMode, setAppProviderMode] = useState<AppProviderMode>('api')
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>('custom')
  const [appForm, setAppForm] = useState<AppProviderFormState>(() => emptyAppForm('codex'))
  const [useCodexAdvancedConfig, setUseCodexAdvancedConfig] = useState(false)
  const [codexAuthJsonText, setCodexAuthJsonText] = useState(() => buildCodexAuthJsonText(''))
  const [codexConfigTomlText, setCodexConfigTomlText] = useState(() =>
    buildCodexConfigTomlText('https://api.openai.com/v1', 'gpt-5.2')
  )
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
  const currentProviderSubtitle = currentProvider ? getProviderSubtitle(currentProvider) : ''

  useEffect(() => {
    if (!message || message.type !== 'success') return
    const timer = window.setTimeout(() => setMessage(null), 3200)
    return () => window.clearTimeout(timer)
  }, [message])

  const patchAppForm = (patch: Partial<AppProviderFormState>) => {
    setAppForm((prev) => {
      const next = { ...prev, ...patch }
      if (activeApp === 'codex' && appProviderMode === 'api' && !useCodexAdvancedConfig) {
        setCodexAuthJsonText(buildCodexAuthJsonText(next.apiKey))
        setCodexConfigTomlText(
          buildCodexConfigTomlText(next.endpoint, next.model, selectedPresetKey)
        )
      }
      return next
    })
  }

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
    const nextForm = emptyAppForm(appType)
    setAppForm(nextForm)
    setUseCodexAdvancedConfig(false)
    if (appType === 'codex') {
      setCodexAuthJsonText(buildCodexAuthJsonText(nextForm.apiKey))
      setCodexConfigTomlText(buildCodexConfigTomlText(nextForm.endpoint, nextForm.model, 'custom'))
    }
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
    setMessage(null)
    setDialogTab('app')
    resetAppForm(activeApp)
    resetUniversalForm()
    setDialogOpen(true)
  }

  const handleSwitchProvider = (provider: ProviderRecord) => {
    runMutation(async () => {
      await actionProviderSwitch({ appType: activeApp, providerId: provider.id })
      setMessage({ type: 'success', text: getProviderSwitchToastText(provider) })
    })
  }

  const handleDeleteProvider = async (providerId: string, providerName: string) => {
    const confirmed = await confirmDialog({
      title: '删除供应商',
      message: `删除供应商「${providerName}」？`,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!confirmed) return

    runMutation(async () => {
      await actionProviderDelete(providerId)
      setMessage({ type: 'success', text: '供应商已删除。' })
      if (editingProviderId === providerId) {
        resetAppForm(activeApp)
      }
    })
  }

  const handleApplyPreset = (preset: AppProviderPreset) => {
    setSelectedPresetKey(preset.key)
    setAppProviderMode(preset.mode)
    setAppForm((prev) => {
      const next = {
        ...prev,
        name: editingProviderId ? prev.name : preset.label,
        website: preset.website || prev.website,
        endpoint: preset.endpoint || prev.endpoint,
        model: preset.model || prev.model,
      }

      if (activeApp === 'codex') {
        setUseCodexAdvancedConfig(false)
        setCodexAuthJsonText(buildCodexAuthJsonText(next.apiKey))
        setCodexConfigTomlText(buildCodexConfigTomlText(next.endpoint, next.model, preset.key))
      }

      return next
    })
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
        const nextForm = {
          ...emptyAppForm(provider.appType),
          name: raw.name,
          ...extracted,
        }
        setAppForm(nextForm)
        if (provider.appType === 'codex') {
          setUseCodexAdvancedConfig(false)
          setCodexAuthJsonText(stringifyCodexAuthJson(raw.config.auth, nextForm.apiKey))
          setCodexConfigTomlText(
            stringifyCodexConfigToml(
              raw.config.config ?? raw.config.configToml,
              nextForm.endpoint,
              nextForm.model
            )
          )
        }
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
    const isEditingProvider = Boolean(editingProviderId)

    if (!appForm.name.trim()) {
      setMessage({ type: 'error', text: '供应商名称不能为空。' })
      return
    }

    if (appProviderMode === 'api' && !appForm.apiKey.trim()) {
      setMessage({ type: 'error', text: 'API 供应商必须填写 API Key。' })
      return
    }

    let parsedCodexAuth: Record<string, unknown> | null = null
    let parsedCodexTomlMeta: { endpoint: string; model: string } | null = null
    let parsedCodexConfigText: string | null = null
    const shouldParseCodexRawConfig =
      activeApp === 'codex' && (useCodexAdvancedConfig || isEditingProvider)
    if (shouldParseCodexRawConfig) {
      try {
        const parsedAuth = JSON.parse(codexAuthJsonText)
        if (!isObjectRecord(parsedAuth)) {
          throw new Error('auth.json 必须是 JSON 对象')
        }
        parsedCodexAuth = parsedAuth
        const parsedInfo = parseCodexTomlInfo(codexConfigTomlText, appForm.endpoint, appForm.model)
        parsedCodexTomlMeta = {
          endpoint: parsedInfo.endpoint,
          model: parsedInfo.model,
        }
        parsedCodexConfigText =
          parsedInfo.configText || normalizeTomlTextWithEol(codexConfigTomlText)
      } catch (error) {
        setMessage({
          type: 'error',
          text: error instanceof Error ? `高级配置解析失败: ${error.message}` : String(error),
        })
        return
      }
    }

    runMutation(async () => {
      if (appProviderMode === 'official') {
        if (editingProviderId) {
          const raw = await actionProviderGetRaw(editingProviderId)
          const existingProfile = getProfile(raw.config)
          const nextOfficialConfig: Record<string, unknown> = {
            ...raw.config,
            _profile: {
              ...existingProfile,
              kind: 'official',
              vendorKey: selectedPresetKey === 'custom' ? undefined : selectedPresetKey,
              accountName: appForm.accountName.trim() || undefined,
              website: appForm.website.trim() || undefined,
              note: appForm.note.trim() || undefined,
            },
          }

          if (activeApp === 'codex' && parsedCodexAuth && parsedCodexConfigText) {
            nextOfficialConfig.auth = parsedCodexAuth
            nextOfficialConfig.config = parsedCodexConfigText
          }

          await actionProviderUpdate({
            id: editingProviderId,
            name: appForm.name.trim(),
            config: nextOfficialConfig,
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
          endpoint: (parsedCodexTomlMeta?.endpoint || appForm.endpoint).trim() || undefined,
          model: (parsedCodexTomlMeta?.model || appForm.model).trim() || undefined,
          note: appForm.note.trim() || undefined,
        }

        const nextConfig =
          activeApp === 'codex' &&
          (useCodexAdvancedConfig || isEditingProvider) &&
          parsedCodexAuth &&
          parsedCodexConfigText
            ? {
                _profile: profile,
                auth: parsedCodexAuth,
                config: parsedCodexConfigText,
              }
            : buildApiConfig(activeApp, appForm, profile, selectedPresetKey)

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

  const handleDeleteUniversal = async (provider: UniversalProviderRecord) => {
    const confirmed = await confirmDialog({
      title: '删除统一供应商',
      message: `删除统一供应商「${provider.name}」？`,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消',
    })
    if (!confirmed) return

    runMutation(async () => {
      await actionUniversalProviderDelete(provider.id)
      setMessage({ type: 'success', text: '统一供应商已删除。' })
    })
  }

  const handleFormatCodexAdvanced = () => {
    try {
      const parsedAuth = JSON.parse(codexAuthJsonText)
      if (!isObjectRecord(parsedAuth)) {
        throw new Error('auth.json 必须是 JSON 对象')
      }

      setCodexAuthJsonText(`${JSON.stringify(parsedAuth, null, 2)}\n`)
      setCodexConfigTomlText(normalizeTomlTextWithEol(codexConfigTomlText.trim()))
      setMessage({ type: 'success', text: '已格式化 Codex 配置。' })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? `格式化失败: ${error.message}` : String(error),
      })
    }
  }

  const selectedPreset = APP_PRESETS[activeApp].find((preset) => preset.key === selectedPresetKey)
  const isEditingProvider = Boolean(editingProviderId)
  const showAppDialogContent = isEditingProvider || dialogTab === 'app'
  const shouldShowCodexRawSection =
    activeApp === 'codex' && (isEditingProvider || appProviderMode === 'api')
  const shouldShowCodexRawEditors = isEditingProvider || useCodexAdvancedConfig

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
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${
                activeApp === appType
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <AppTypeIcon appType={appType} active={activeApp === appType} />
              <span>{APP_LABEL[appType]}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openCreateDialog}
            disabled={isPending}
            className="h-10 w-10 rounded-full bg-[#d97757] text-white shadow hover:bg-[#c05f3e] disabled:opacity-50 inline-flex items-center justify-center"
            title="添加供应商"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="text-sm text-gray-500">当前供应商</div>
        <div className="mt-1 text-lg font-semibold">{currentProvider?.name || '未选择'}</div>
        {currentProvider && currentProviderSubtitle && (
          <div className="mt-1 text-sm text-gray-500">{currentProviderSubtitle}</div>
        )}
      </div>

      {message && !dialogOpen && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4 sm:top-6 sm:justify-end">
          <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-gray-200 bg-white/95 shadow-lg backdrop-blur">
            <div className="flex items-start gap-3 p-3">
              <div
                className={`mt-0.5 rounded-full p-1.5 ${
                  message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {message.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              </div>
              <div className="flex-1 text-sm text-gray-800">{message.text}</div>
              <button
                type="button"
                onClick={() => setMessage(null)}
                className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="关闭通知"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {appProviders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
            当前 {APP_LABEL[activeApp]} 还没有可切换供应商。
          </div>
        ) : (
          appProviders.map((provider) => {
            const subtitle = getProviderSubtitle(provider)
            return (
              <div
                key={provider.id}
                className={`rounded-2xl border p-4 bg-white ${
                  provider.isCurrent
                    ? 'border-[#e6b8a1] bg-[#fff4ee] shadow-[0_0_0_1px_rgba(217,119,87,0.22)]'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-2xl font-semibold leading-none">
                      <span className="text-base font-semibold text-gray-900">{provider.name}</span>
                    </div>
                    {subtitle && <div className="mt-1 text-sm text-gray-600">{subtitle}</div>}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSwitchProvider(provider)}
                      disabled={isPending || provider.isCurrent}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        provider.isCurrent
                          ? 'border border-gray-200 bg-gray-100 text-gray-500'
                          : 'bg-[#d97757] text-white hover:bg-[#c05f3e]'
                      }`}
                      title={provider.isCurrent ? '已启用' : '启用'}
                      aria-label={provider.isCurrent ? '已启用' : '启用'}
                    >
                      {provider.isCurrent ? <CheckCircle2 size={13} /> : <Play size={13} />}
                      {provider.isCurrent ? '已启用' : '启用'}
                    </button>
                    <button
                      onClick={() => handleEditProvider(provider)}
                      disabled={isPending}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
                      title="编辑供应商"
                      aria-label="编辑供应商"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={() => handleDeleteProvider(provider.id, provider.name)}
                      disabled={isPending}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      title="删除供应商"
                      aria-label="删除供应商"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
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
                    {APPS.map((appType) =>
                      provider.apps[appType] ? (
                        <span
                          key={appType}
                          className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                        >
                          <AppTypeIcon appType={appType} className="h-3.5 w-3.5 shrink-0" />
                          {APP_LABEL[appType]}
                        </span>
                      ) : null
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
                  <div className="text-3xl font-semibold">
                    {isEditingProvider ? '编辑供应商' : '添加新供应商'}
                  </div>
                  <div className="text-sm text-gray-500">当前应用: {APP_LABEL[activeApp]}</div>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-5">
              {message && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    message.type === 'success'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {message.text}
                </div>
              )}

              {!isEditingProvider && (
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
                  <button
                    onClick={() => setDialogTab('app')}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      dialogTab === 'app' ? 'bg-[#d97757] text-white' : 'text-gray-500'
                    }`}
                  >
                    {APP_LABEL[activeApp]} 供应商
                  </button>
                  <button
                    onClick={() => setDialogTab('universal')}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      dialogTab === 'universal' ? 'bg-[#d97757] text-white' : 'text-gray-500'
                    }`}
                  >
                    统一供应商
                  </button>
                </div>
              )}

              {showAppDialogContent ? (
                <div className="space-y-4 rounded-xl border border-gray-200 p-5">
                  {!isEditingProvider && (
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
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={appForm.name}
                      onChange={(event) => patchAppForm({ name: event.target.value })}
                      placeholder="供应商名称"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={appForm.note}
                      onChange={(event) => patchAppForm({ note: event.target.value })}
                      placeholder="备注（可选）"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={appForm.website}
                      onChange={(event) => patchAppForm({ website: event.target.value })}
                      placeholder="官网链接（可选）"
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm md:col-span-2"
                    />

                    {appProviderMode === 'official' ? (
                      <>
                        {!(isEditingProvider && activeApp === 'codex') && (
                          <input
                            value={appForm.accountName}
                            onChange={(event) => patchAppForm({ accountName: event.target.value })}
                            placeholder="账号备注（如：公司账号）"
                            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm md:col-span-2"
                          />
                        )}
                        {isEditingProvider && activeApp === 'codex' && (
                          <input
                            value=""
                            disabled
                            placeholder="官方无需填写 API Key，直接保存即可"
                            className="w-full rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500 md:col-span-2"
                          />
                        )}
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 md:col-span-2">
                          {isEditingProvider
                            ? `当前为${APP_LABEL[activeApp]}官方供应商编辑模式，保存后会更新该账号配置。`
                            : `请先在本机完成 ${APP_LABEL[activeApp]} 登录，再点击添加以捕获当前 live 配置。`}
                        </div>
                      </>
                    ) : (
                      <>
                        <input
                          value={appForm.apiKey}
                          onChange={(event) => patchAppForm({ apiKey: event.target.value })}
                          placeholder="API Key"
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm md:col-span-2"
                        />
                        <input
                          value={appForm.endpoint}
                          onChange={(event) => patchAppForm({ endpoint: event.target.value })}
                          placeholder="API 请求地址"
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                        />
                        <input
                          value={appForm.model}
                          onChange={(event) => patchAppForm({ model: event.target.value })}
                          placeholder="模型名称"
                          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                        />
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 md:col-span-2">
                          填写兼容 OpenAI Responses 格式的 API 请求地址。
                        </div>
                      </>
                    )}

                    {shouldShowCodexRawSection && (
                      <div className="md:col-span-2 space-y-3 rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">Codex 原始配置</div>
                          <div className="flex items-center gap-2">
                            {!isEditingProvider && (
                              <button
                                type="button"
                                onClick={() => setUseCodexAdvancedConfig((prev) => !prev)}
                                className="rounded border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50"
                              >
                                {useCodexAdvancedConfig
                                  ? '关闭高级配置'
                                  : '编辑 auth.json/config.toml'}
                              </button>
                            )}
                            {(shouldShowCodexRawEditors || isEditingProvider) && (
                              <button
                                type="button"
                                onClick={handleFormatCodexAdvanced}
                                className="rounded border border-gray-200 px-2.5 py-1 text-xs hover:bg-gray-50"
                              >
                                格式化
                              </button>
                            )}
                          </div>
                        </div>

                        {shouldShowCodexRawEditors ? (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-gray-600">
                                auth.json (JSON) *
                              </div>
                              <textarea
                                value={codexAuthJsonText}
                                onChange={(event) => setCodexAuthJsonText(event.target.value)}
                                className="min-h-28 w-full rounded-md border border-gray-200 bg-slate-50 px-3 py-2 text-xs font-mono"
                                spellCheck={false}
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-gray-600">
                                config.toml (TOML)
                              </div>
                              <textarea
                                value={codexConfigTomlText}
                                onChange={(event) => setCodexConfigTomlText(event.target.value)}
                                className="min-h-44 w-full rounded-md border border-gray-200 bg-slate-50 px-3 py-2 text-xs font-mono"
                                spellCheck={false}
                              />
                            </div>
                            <div className="text-xs text-gray-500">
                              {isEditingProvider
                                ? '编辑模式下会按这里的 JSON/TOML 内容保存该供应商。'
                                : '开启后会以这里的 JSON/TOML 内容为准写入 Provider。'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">
                            开启高级配置后可直接编辑 auth.json 与 config.toml。
                          </div>
                        )}
                      </div>
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
                          <AppTypeIcon appType={appType} className="h-4 w-4 shrink-0" />
                          <span>{APP_LABEL[appType]}</span>
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

              {showAppDialogContent ? (
                <button
                  onClick={handleSubmitAppProvider}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#d97757] px-4 py-2 text-sm text-white hover:bg-[#c05f3e] disabled:opacity-50"
                >
                  {appProviderMode === 'official' ? <ShieldCheck size={14} /> : <Plus size={14} />}
                  {editingProviderId ? '保存' : '添加'}
                </button>
              ) : (
                <button
                  onClick={handleSubmitUniversalProvider}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#d97757] px-4 py-2 text-sm text-white hover:bg-[#c05f3e] disabled:opacity-50"
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
