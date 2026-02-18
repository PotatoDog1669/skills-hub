import fs from 'fs-extra'
import path from 'path'

function normalizeSyncMode(mode) {
  return mode === 'link' ? 'link' : 'copy'
}

async function getPathState(targetPath) {
  try {
    const stat = await fs.lstat(targetPath)
    if (stat.isSymbolicLink()) {
      return { kind: 'symlink' }
    }
    if (stat.isDirectory()) {
      return { kind: 'directory' }
    }
    if (stat.isFile()) {
      return { kind: 'file' }
    }
    return { kind: 'other' }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { kind: 'missing' }
    }
    throw error
  }
}

function buildCopyChanges(sourcePath, destination, destinationState) {
  if (destinationState.kind === 'missing') {
    return [
      {
        type: 'add',
        src: sourcePath,
        dest: destination,
        reason: 'copy new skill directory',
      },
    ]
  }

  if (destinationState.kind === 'symlink') {
    return [
      {
        type: 'delete',
        src: destination,
        dest: destination,
        reason: 'remove existing symlink before copy',
      },
      {
        type: 'update',
        src: sourcePath,
        dest: destination,
        reason: 'overwrite destination with copied directory',
      },
    ]
  }

  return [
    {
      type: 'update',
      src: sourcePath,
      dest: destination,
      reason: `overwrite existing ${destinationState.kind} with copied directory`,
    },
  ]
}

function buildLinkChanges(sourcePath, destination, destinationState) {
  const changes = []

  if (destinationState.kind !== 'missing') {
    changes.push({
      type: 'delete',
      src: destination,
      dest: destination,
      reason: `remove existing ${destinationState.kind} before linking`,
    })
  }

  changes.push({
    type: 'link',
    src: sourcePath,
    dest: destination,
    reason: 'create symbolic link',
  })

  return changes
}

async function previewSkillSync(input) {
  const sourcePath = String(input?.sourcePath || '').trim()
  const destParentPath = String(input?.destParentPath || '').trim()
  const mode = normalizeSyncMode(input?.mode)

  if (!sourcePath) {
    throw new Error('sourcePath is required')
  }
  if (!destParentPath) {
    throw new Error('destParentPath is required')
  }

  const skillDirName = path.basename(sourcePath)
  const destination = path.join(destParentPath, skillDirName)
  if (sourcePath === destination) {
    return { sourcePath, destination, mode, changes: [] }
  }

  const destinationState = await getPathState(destination)
  const changes =
    mode === 'link'
      ? buildLinkChanges(sourcePath, destination, destinationState)
      : buildCopyChanges(sourcePath, destination, destinationState)

  return {
    sourcePath,
    destination,
    mode,
    changes,
  }
}

async function syncSkill(input) {
  const plan = await previewSkillSync(input)

  if (plan.sourcePath === plan.destination) {
    return plan
  }

  const destination = plan.destination
  await fs.ensureDir(path.dirname(destination))

  if (plan.mode === 'link') {
    await fs.remove(destination)
    await fs.ensureSymlink(plan.sourcePath, destination)
    return plan
  }

  const isSymlink = await fs
    .lstat(destination)
    .then((stat) => stat.isSymbolicLink())
    .catch(() => false)

  if (isSymlink) {
    await fs.remove(destination)
  }

  await fs.copy(plan.sourcePath, destination, { overwrite: true, errorOnExist: false })
  return plan
}

function summarizeSyncChanges(changes) {
  const summary = {
    total: 0,
    add: 0,
    update: 0,
    delete: 0,
    link: 0,
  }

  for (const change of Array.isArray(changes) ? changes : []) {
    if (!change || typeof change !== 'object') continue
    if (!(change.type in summary)) continue
    summary[change.type] += 1
    summary.total += 1
  }

  return summary
}

export { normalizeSyncMode, previewSkillSync, syncSkill, summarizeSyncChanges }
