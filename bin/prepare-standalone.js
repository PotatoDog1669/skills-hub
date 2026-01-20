#!/usr/bin/env node
'use strict'

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs/promises')
const path = require('path')

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function copyDir(source, destination) {
  await fs.rm(destination, { recursive: true, force: true })
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.cp(source, destination, { recursive: true })
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const standaloneDir = path.join(root, '.next', 'standalone')
  const staticSource = path.join(root, '.next', 'static')
  const staticDest = path.join(standaloneDir, '.next', 'static')
  const publicSource = path.join(root, 'public')
  const publicDest = path.join(standaloneDir, 'public')

  if (!(await pathExists(standaloneDir))) {
    throw new Error('Standalone build output missing. Run `npm run build` first.')
  }

  if (!(await pathExists(staticSource))) {
    throw new Error('Missing .next/static output. Run `npm run build` first.')
  }

  await copyDir(staticSource, staticDest)

  if (await pathExists(publicSource)) {
    await copyDir(publicSource, publicDest)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
