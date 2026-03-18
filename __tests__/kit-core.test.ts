// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const now = 1_700_000_000_000

async function importCore() {
  vi.resetModules()
  return import('../lib/core/kit-core.mjs')
}

describe('kit core', () => {
  let tempRoot: string
  let tempHome: string
  let originalHome: string | undefined

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-kit-'))
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

  it('creates and updates policy/loadout/kit records', async () => {
    const core = await importCore()

    const policy = core.addKitPolicy({
      name: 'frontend-policy',
      description: 'frontend guideline',
      content: '# AGENTS\n\nUse strict TS.',
    })
    expect(policy).toBeTruthy()
    const policyRecord = policy!

    const loadout = core.addKitLoadout({
      name: 'frontend-loadout',
      description: 'skills for frontend',
      items: [
        { skillPath: '/tmp/skills/react', mode: 'copy', sortOrder: 0 },
        { skillPath: '/tmp/skills/css', mode: 'link', sortOrder: 1 },
      ],
    })
    expect(loadout).toBeTruthy()
    const loadoutRecord = loadout!
    expect(loadoutRecord.items).toHaveLength(2)

    const kit = core.addKit({
      name: 'frontend-kit',
      policyId: policyRecord.id,
      loadoutId: loadoutRecord.id,
    })
    expect(kit).toBeTruthy()
    const kitRecord = kit!

    expect(core.listKits()).toHaveLength(1)
    expect(kitRecord.policyId).toBe(policyRecord.id)
    expect(kitRecord.loadoutId).toBe(loadoutRecord.id)

    const updatedPolicy = core.updateKitPolicy({
      id: policyRecord.id,
      name: 'frontend-policy-v2',
      content: '# AGENTS\n\nUse strict TS + tests.',
    })
    expect(updatedPolicy).toBeTruthy()
    expect(updatedPolicy!.name).toBe('frontend-policy-v2')

    const updatedLoadout = core.updateKitLoadout({
      id: loadoutRecord.id,
      items: [{ skillPath: '/tmp/skills/react', mode: 'link', sortOrder: 0 }],
    })
    expect(updatedLoadout).toBeTruthy()
    expect(updatedLoadout!.items).toEqual([
      {
        skillPath: '/tmp/skills/react',
        mode: 'link',
        sortOrder: 0,
      },
    ])

    const updatedKit = core.updateKit({ id: kitRecord.id, name: 'frontend-kit-v2' })
    expect(updatedKit).toBeTruthy()
    expect(updatedKit!.name).toBe('frontend-kit-v2')
  })

  it('prevents deleting policy/loadout referenced by kit preset', async () => {
    const core = await importCore()

    const policy = core.addKitPolicy({
      name: 'p1',
      content: '# AGENTS\ncontent',
    })
    const loadout = core.addKitLoadout({
      name: 'l1',
      items: [{ skillPath: '/tmp/skills/a', mode: 'copy', sortOrder: 0 }],
    })
    expect(policy).toBeTruthy()
    expect(loadout).toBeTruthy()
    const policyRecord = policy!
    const loadoutRecord = loadout!

    const kit = core.addKit({
      name: 'kit-1',
      policyId: policyRecord.id,
      loadoutId: loadoutRecord.id,
    })
    expect(kit).toBeTruthy()
    const kitRecord = kit!

    expect(() => core.deleteKitPolicy(policyRecord.id)).toThrow(
      /referenced by existing kit presets/
    )
    expect(() => core.deleteKitLoadout(loadoutRecord.id)).toThrow(
      /referenced by existing kit presets/
    )

    expect(core.deleteKit(kitRecord.id)).toBe(true)
    expect(core.deleteKitPolicy(policyRecord.id)).toBe(true)
    expect(core.deleteKitLoadout(loadoutRecord.id)).toBe(true)
  })

  it('marks kit applied with project and agent metadata', async () => {
    const core = await importCore()

    const policy = core.addKitPolicy({
      name: 'policy-a',
      content: '# AGENTS\npolicy-a',
    })
    const loadout = core.addKitLoadout({
      name: 'loadout-a',
      items: [{ skillPath: '/tmp/skills/a', mode: 'copy', sortOrder: 0 }],
    })
    expect(policy).toBeTruthy()
    expect(loadout).toBeTruthy()
    const policyRecord = policy!
    const loadoutRecord = loadout!

    const kit = core.addKit({
      name: 'kit-a',
      policyId: policyRecord.id,
      loadoutId: loadoutRecord.id,
    })
    expect(kit).toBeTruthy()
    const kitRecord = kit!

    const marked = core.markKitApplied({
      id: kitRecord.id,
      projectPath: '/tmp/project-a',
      agentName: 'Claude Code',
    })
    expect(marked).toBeTruthy()
    const markedRecord = marked!

    expect(markedRecord.lastAppliedAt).toBeTypeOf('number')
    expect(markedRecord.lastAppliedTarget).toMatchObject({
      projectPath: '/tmp/project-a',
      agentName: 'Claude Code',
    })
  })

  it('allows policy-only and loadout-only kits', async () => {
    const core = await importCore()

    const policy = core.addKitPolicy({
      name: 'policy-only',
      content: '# AGENTS\npolicy-only',
    })
    const loadout = core.addKitLoadout({
      name: 'loadout-only',
      items: [{ skillPath: '/tmp/skills/solo', mode: 'copy', sortOrder: 0 }],
    })

    const policyOnlyKit = core.addKit({
      name: 'policy-kit',
      policyId: policy!.id,
    })
    const loadoutOnlyKit = core.addKit({
      name: 'loadout-kit',
      loadoutId: loadout!.id,
    })

    expect(policyOnlyKit?.policyId).toBe(policy!.id)
    expect(policyOnlyKit?.loadoutId).toBeUndefined()
    expect(loadoutOnlyKit?.policyId).toBeUndefined()
    expect(loadoutOnlyKit?.loadoutId).toBe(loadout!.id)

    expect(() =>
      core.addKit({
        name: 'invalid-kit',
      })
    ).toThrow(/at least AGENTS\.md or Skills package/)
  })

  it('restores a managed official kit baseline', async () => {
    const core = await importCore()

    const policy = core.addKitPolicy({
      name: 'Recommended: Fullstack',
      content: '# AGENTS\nbaseline',
    })
    const loadout = core.addKitLoadout({
      name: 'Official: Fullstack',
      items: [{ skillPath: '/tmp/skills/a', mode: 'copy', sortOrder: 0 }],
    })

    const kit = core.addKit({
      name: 'Official: Fullstack',
      description: 'baseline',
      policyId: policy!.id,
      loadoutId: loadout!.id,
      managedSource: {
        kind: 'official_preset',
        presetId: 'fullstack-product-engineering',
        presetName: 'Fullstack Product Engineering',
        catalogVersion: 2,
        installedAt: now,
        restoreCount: 0,
        baseline: {
          name: 'Official: Fullstack',
          description: 'baseline',
          policy: {
            id: policy!.id,
            name: policy!.name,
            description: policy!.description,
            content: policy!.content,
          },
          loadout: {
            id: loadout!.id,
            name: loadout!.name,
            description: loadout!.description,
            items: loadout!.items,
          },
        },
        securityChecks: [],
      },
    })

    core.updateKitPolicy({
      id: policy!.id,
      name: 'Edited Policy',
      content: '# AGENTS\nedited',
    })
    core.updateKitLoadout({
      id: loadout!.id,
      items: [{ skillPath: '/tmp/skills/edited', mode: 'copy', sortOrder: 0 }],
    })
    core.updateKit({
      id: kit!.id,
      name: 'Edited Kit',
      description: 'edited',
    })

    const restored = core.restoreManagedKitBaseline(kit!.id)
    expect(restored).toBeTruthy()
    expect(restored!.name).toBe('Official: Fullstack')
    expect(restored!.description).toBe('baseline')
    expect(restored!.managedSource?.restoreCount).toBe(1)
    expect(restored!.managedSource?.lastRestoredAt).toBeTypeOf('number')

    const restoredPolicy = core.getKitPolicyById(policy!.id)
    expect(restoredPolicy?.name).toBe('Recommended: Fullstack')
    expect(restoredPolicy?.content).toContain('baseline')

    const restoredLoadout = core.getKitLoadoutById(loadout!.id)
    expect(restoredLoadout?.items).toEqual([
      {
        skillPath: '/tmp/skills/a',
        mode: 'copy',
        sortOrder: 0,
      },
    ])
  })
})
