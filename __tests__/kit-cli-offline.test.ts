// @vitest-environment node

import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = process.cwd()
const binPath = path.join(repoRoot, 'bin', 'skills-hub')

describe('kit CLI offline behavior', () => {
  let tempRoot: string
  let tempHome: string

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-hub-kit-offline-'))
    tempHome = path.join(tempRoot, 'home')
    await fs.ensureDir(tempHome)
  })

  afterEach(async () => {
    await fs.remove(tempRoot)
  })

  it('does not require official preset catalog access for kit commands', async () => {
    const env = {
      ...process.env,
      HOME: tempHome,
      SKILLS_HUB_OFFICIAL_PRESETS_DIR: path.join(tempRoot, 'missing-catalog'),
    }

    const listed = await execFileAsync('node', [binPath, 'kit', 'policy-list'], {
      cwd: repoRoot,
      env,
    })

    expect(listed.stdout).toContain('No AGENTS.md templates found.')
  })
})
