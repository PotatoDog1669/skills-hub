// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import TOML from '@iarna/toml'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function importCore() {
  vi.resetModules()
  return import('../lib/core/provider-core.mjs')
}

describe('provider core', () => {
  let tempRoot: string
  let tempHome: string
  let originalHome: string | undefined

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-provider-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)

    originalHome = process.env.HOME
    process.env.HOME = tempHome
  })

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }

    await fs.remove(tempRoot)
  })

  it('switches claude providers and backfills live config to previous current provider', async () => {
    const claudeSettingsPath = path.join(tempHome, '.claude', 'settings.json')
    await fs.ensureDir(path.dirname(claudeSettingsPath))
    await fs.writeJson(claudeSettingsPath, { api_key: 'live-old', model: 'legacy-model' })

    const core = await importCore()

    const providerA = core.addProvider({
      appType: 'claude',
      name: 'claude-a',
      config: {
        api_key: 'key-a',
        model: 'claude-sonnet-4',
        _profile: { kind: 'official', accountName: 'work-a', note: 'note-a' },
      },
    })!

    const providerB = core.addProvider({
      appType: 'claude',
      name: 'claude-b',
      config: { api_key: 'key-b', model: 'claude-opus-4.1' },
    })!

    await core.switchProvider({ appType: 'claude', providerId: providerA.id })

    await fs.writeJson(claudeSettingsPath, {
      api_key: 'manual-live-key',
      model: 'manual-live-model',
    })

    await core.switchProvider({ appType: 'claude', providerId: providerB.id })

    const updatedProviderA = core.getProviderById(providerA.id)
    expect(updatedProviderA?.config).toMatchObject({
      api_key: 'manual-live-key',
      model: 'manual-live-model',
      _profile: {
        kind: 'official',
        accountName: 'work-a',
        note: 'note-a',
      },
    })

    const current = core.getCurrentProvider('claude')
    expect(current?.id).toBe(providerB.id)

    const latestBackup = core.getLatestBackup('claude')
    expect(latestBackup).toBeTruthy()
    expect(latestBackup?.appType).toBe('claude')
  })

  it('captures official account from live config and does not write _profile into live files', async () => {
    const claudeSettingsPath = path.join(tempHome, '.claude', 'settings.json')
    await fs.ensureDir(path.dirname(claudeSettingsPath))
    await fs.writeJson(claudeSettingsPath, {
      api_key: 'official-live-key',
      model: 'claude-sonnet-4',
      account: 'work-account',
    })

    const core = await importCore()

    const captured = (await core.captureProviderFromLive({
      appType: 'claude',
      name: 'claude-official-work',
      profile: {
        kind: 'official',
        accountName: 'work-account',
        note: 'captured from local login',
      },
    }))!

    expect(captured?.config?._profile).toMatchObject({
      kind: 'official',
      accountName: 'work-account',
      note: 'captured from local login',
    })

    await core.switchProvider({ appType: 'claude', providerId: captured.id })

    const liveAfterSwitch = await fs.readJson(claudeSettingsPath)
    expect(liveAfterSwitch._profile).toBeUndefined()
    expect(liveAfterSwitch).toMatchObject({
      api_key: 'official-live-key',
      model: 'claude-sonnet-4',
      account: 'work-account',
    })
  })

  it('writes codex auth.json and config.toml during switch', async () => {
    const codexDir = path.join(tempHome, '.codex')
    await fs.ensureDir(codexDir)
    await fs.writeJson(path.join(codexDir, 'auth.json'), {
      OPENAI_API_KEY: null,
      auth_mode: 'chatgpt',
    })
    await fs.writeFile(path.join(codexDir, 'config.toml'), 'model = "old-model"\n', 'utf-8')

    const core = await importCore()

    const provider = core.addProvider({
      appType: 'codex',
      name: 'codex-provider',
      config: {
        auth: { OPENAI_API_KEY: 'new-key', organization: 'org-demo' },
        config: `model_provider = "openai"
model = "gpt-5"
model_reasoning_effort = "high"

[model_providers.openai]
name = "openai"
base_url = "https://api.openai.com/v1"
wire_api = "responses"
requires_openai_auth = true
`,
      },
    })!

    await core.switchProvider({ appType: 'codex', providerId: provider.id })

    const auth = await fs.readJson(path.join(codexDir, 'auth.json'))
    expect(auth).toEqual({
      OPENAI_API_KEY: 'new-key',
      organization: 'org-demo',
    })

    const configTomlRaw = await fs.readFile(path.join(codexDir, 'config.toml'), 'utf-8')
    const configToml = TOML.parse(configTomlRaw)
    expect(configToml).toMatchObject({ model: 'gpt-5' })
    expect(configToml).toMatchObject({
      model_providers: {
        openai: {
          base_url: 'https://api.openai.com/v1',
        },
      },
    })
  })

  it('captures codex official provider without inheriting api key', async () => {
    const codexDir = path.join(tempHome, '.codex')
    await fs.ensureDir(codexDir)
    await fs.writeJson(path.join(codexDir, 'auth.json'), {
      OPENAI_API_KEY: 'test-key-should-not-be-captured',
      auth_mode: 'chatgpt',
      tokens: { access_token: 'token-demo', account_id: 'acc-1' },
    })
    await fs.writeFile(
      path.join(codexDir, 'config.toml'),
      'model = "gpt-5.2"\napi_base_url = "https://example.com/v1"\n',
      'utf-8'
    )

    const core = await importCore()
    const captured = await core.captureProviderFromLive({
      appType: 'codex',
      name: 'codex-official',
      profile: { kind: 'official', accountName: 'work-official' },
    })
    expect(captured).toBeTruthy()
    const capturedProvider = captured!

    expect(capturedProvider.config?._profile).toMatchObject({
      kind: 'official',
      accountName: 'work-official',
    })
    expect(capturedProvider.config?.auth).toMatchObject({
      OPENAI_API_KEY: null,
      auth_mode: 'chatgpt',
      tokens: { access_token: 'token-demo', account_id: 'acc-1' },
    })
    expect((capturedProvider.config?.auth as Record<string, unknown>)?.api_key).toBeUndefined()
    expect((capturedProvider.config?._profile as Record<string, unknown>)?.accountId).toBe('acc-1')

    const authSnapshotPath = path.join(
      tempHome,
      '.skills-hub',
      'provider-auth',
      'codex',
      capturedProvider.id,
      'auth.json'
    )
    const authSnapshot = await fs.readJson(authSnapshotPath)
    expect(authSnapshot).toMatchObject({
      OPENAI_API_KEY: null,
      auth_mode: 'chatgpt',
      tokens: { account_id: 'acc-1' },
    })
  })

  it('creates empty auth slot when capturing duplicate codex official account', async () => {
    const codexDir = path.join(tempHome, '.codex')
    await fs.ensureDir(codexDir)
    await fs.writeJson(path.join(codexDir, 'auth.json'), {
      OPENAI_API_KEY: null,
      auth_mode: 'chatgpt',
      tokens: { account_id: 'dup-acc-1' },
    })
    await fs.writeFile(
      path.join(codexDir, 'config.toml'),
      'model = "gpt-5.2"\napi_base_url = "https://example.com/v1"\n',
      'utf-8'
    )

    const core = await importCore()
    await core.captureProviderFromLive({
      appType: 'codex',
      name: 'official-1',
      profile: { kind: 'official', accountName: 'acc-1' },
    })

    const duplicated = await core.captureProviderFromLive({
      appType: 'codex',
      name: 'official-dup',
      profile: { kind: 'official', accountName: 'acc-dup' },
    })
    expect(duplicated).toBeTruthy()
    const duplicatedProvider = duplicated!

    expect(duplicatedProvider.config?._profile).toMatchObject({
      kind: 'official',
      accountName: 'acc-dup',
    })
    expect(
      (duplicatedProvider.config?._profile as Record<string, unknown>)?.accountId
    ).toBeUndefined()
    expect(duplicatedProvider.config?.auth).toMatchObject({
      OPENAI_API_KEY: null,
      auth_mode: 'chatgpt',
    })
    expect(
      ((duplicatedProvider.config?.auth as Record<string, unknown>)?.tokens as unknown) ?? null
    ).toBeNull()

    const authSnapshotPath = path.join(
      tempHome,
      '.skills-hub',
      'provider-auth',
      'codex',
      duplicatedProvider.id,
      'auth.json'
    )
    const authSnapshot = await fs.readJson(authSnapshotPath)
    expect(authSnapshot).toMatchObject({
      OPENAI_API_KEY: null,
      auth_mode: 'chatgpt',
    })
  })

  it('syncs codex official auth snapshot per provider when switching', async () => {
    const codexDir = path.join(tempHome, '.codex')
    await fs.ensureDir(codexDir)
    await fs.writeJson(path.join(codexDir, 'auth.json'), {
      OPENAI_API_KEY: null,
      auth_mode: 'chatgpt',
      tokens: { account_id: 'acc-a' },
    })
    await fs.writeFile(
      path.join(codexDir, 'config.toml'),
      'model = "gpt-5.2"\napi_base_url = "https://example.com/v1"\n',
      'utf-8'
    )

    const core = await importCore()
    const officialA = await core.captureProviderFromLive({
      appType: 'codex',
      name: 'official-a',
      profile: { kind: 'official', accountName: 'A' },
    })
    const officialB = await core.captureProviderFromLive({
      appType: 'codex',
      name: 'official-b',
      profile: { kind: 'official', accountName: 'B' },
    })
    expect(officialA).toBeTruthy()
    expect(officialB).toBeTruthy()
    const officialAProvider = officialA!
    const officialBProvider = officialB!

    await core.switchProvider({ appType: 'codex', providerId: officialBProvider.id })

    // Simulate logging in on provider B after switch.
    await fs.writeJson(path.join(codexDir, 'auth.json'), {
      OPENAI_API_KEY: null,
      auth_mode: 'chatgpt',
      tokens: { account_id: 'acc-b' },
    })

    // Switch back to A to backfill B's latest login snapshot.
    await core.switchProvider({ appType: 'codex', providerId: officialAProvider.id })
    // Switch to B again, should restore account B snapshot.
    await core.switchProvider({ appType: 'codex', providerId: officialBProvider.id })

    const authAfter = await fs.readJson(path.join(codexDir, 'auth.json'))
    expect(authAfter).toMatchObject({
      auth_mode: 'chatgpt',
      tokens: { account_id: 'acc-b' },
    })
  })

  it('creates and applies universal provider to multiple apps', async () => {
    const core = await importCore()

    const universal = core.addUniversalProvider({
      name: 'newapi-shared',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'shared-key-123',
      apps: {
        claude: true,
        codex: true,
        gemini: false,
      },
      models: {
        claude: { model: 'claude-sonnet-4' },
        codex: { model: 'gpt-5.2' },
      },
    })!

    const applied = core.applyUniversalProvider({ id: universal.id })
    expect(applied).toHaveLength(2)

    const claudeProvider = core.listProviders('claude').find((provider: unknown) => {
      const row = provider as { config?: Record<string, unknown> }
      const profile = row.config?._profile as { universalId?: string } | undefined
      return profile?.universalId === universal.id
    })
    expect(claudeProvider?.config).toMatchObject({
      api_key: 'shared-key-123',
      api_base_url: 'https://gateway.example.com/v1',
      model: 'claude-sonnet-4',
      _profile: {
        kind: 'api',
        universalId: universal.id,
      },
    })

    const codexProvider = core.listProviders('codex').find((provider: unknown) => {
      const row = provider as { config?: Record<string, unknown> }
      const profile = row.config?._profile as { universalId?: string } | undefined
      return profile?.universalId === universal.id
    })
    expect(codexProvider?.config).toMatchObject({
      auth: { OPENAI_API_KEY: 'shared-key-123' },
      _profile: {
        kind: 'api',
        universalId: universal.id,
      },
    })
    const codexConfigText =
      codexProvider &&
      codexProvider.config &&
      typeof (codexProvider.config as Record<string, unknown>).config === 'string'
        ? ((codexProvider.config as Record<string, unknown>).config as string)
        : ''
    expect(codexConfigText).not.toBe('')
    const codexConfig = TOML.parse(codexConfigText)
    expect(codexConfig).toMatchObject({
      model: 'gpt-5.2',
      model_providers: {
        newapi_shared: {
          base_url: 'https://gateway.example.com/v1',
        },
      },
    })
  })

  it('writes gemini .env + settings.json and can restore latest backup', async () => {
    const geminiDir = path.join(tempHome, '.gemini')
    await fs.ensureDir(geminiDir)
    await fs.writeFile(path.join(geminiDir, '.env'), 'GEMINI_API_KEY=live-old\n', 'utf-8')
    await fs.writeJson(path.join(geminiDir, 'settings.json'), { model: 'old-model' })

    const core = await importCore()

    const providerA = core.addProvider({
      appType: 'gemini',
      name: 'gemini-a',
      config: {
        env: { GEMINI_API_KEY: 'gemini-a-key' },
        settings: { model: 'gemini-2.5-pro' },
      },
    })!

    const providerB = core.addProvider({
      appType: 'gemini',
      name: 'gemini-b',
      config: {
        env: { GEMINI_API_KEY: 'gemini-b-key' },
        settings: { model: 'gemini-2.5-flash' },
      },
    })!

    await core.switchProvider({ appType: 'gemini', providerId: providerA.id })

    await fs.writeFile(path.join(geminiDir, '.env'), 'GEMINI_API_KEY=manual-override\n', 'utf-8')

    await core.switchProvider({ appType: 'gemini', providerId: providerB.id })

    await core.restoreBackup('gemini')

    const envAfterRestore = await fs.readFile(path.join(geminiDir, '.env'), 'utf-8')
    expect(envAfterRestore).toContain('manual-override')
  })

  it('masks sensitive keys in provider config', async () => {
    const core = await importCore()

    const provider = core.addProvider({
      appType: 'claude',
      name: 'mask-demo',
      config: {
        api_key: 'sk-1234567890',
        nested: { access_token: 'token-1234567890' },
        model: 'claude-sonnet-4',
      },
    })!

    const masked = core.maskProvider(provider)
    expect(masked?.config).toMatchObject({
      api_key: 'sk-1****90',
      nested: { access_token: 'toke****90' },
      model: 'claude-sonnet-4',
    })
  })
})
