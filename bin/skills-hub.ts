#!/usr/bin/env node
import path from 'path'
import { downloadRemoteSkill } from '../lib/remote'
import { getConfig, AgentConfig } from '../lib/config'
import fs from 'fs-extra'
import os from 'os'
import {
  parseSkillImportUrl,
  buildGitSourceUrl,
  attachSkillImportMetadata,
} from '../lib/import-skill'

// Note: We need to ensure we run this with ts-node or compile it first.
// For dev simplicity in this environment, we might need a wrapper.

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command) {
    console.log('Usage: skills-hub <command> [options]')
    console.log('Commands:')
    console.log('  import <url>   Import a skill from a remote git repository')
    console.log('  list           List all installed skills')
    process.exit(1)
  }

  try {
    switch (command) {
      case 'import':
        await handleImport(args.slice(1))
        break
      case 'list':
        await handleList()
        break
      case 'sync':
        await handleSync(args.slice(1))
        break
      default:
        console.error(`Unknown command: ${command}`)
        process.exit(1)
    }
  } catch (error) {
    console.error('Command failed:', error)
    process.exit(1)
  }
}

async function handleSync(args: string[]) {
  // Basic sync implementation: Sync all skills from Hub to specific agents
  // Usage: skills-hub sync --target=claude
  // Usage: skills-hub sync --all (sync to all enabled agents)

  // Simple argument parsing
  const targetArg = args.find((a) => a.startsWith('--target='))
  const allArg = args.includes('--all')

  if (!targetArg && !allArg) {
    console.error('Error: Please specify --target=<agent_name> or --all')
    process.exit(1)
  }

  const config = await getConfig()
  const hubPath = config.hubPath

  if (!(await fs.pathExists(hubPath))) {
    console.log('Hub directory empty, nothing to sync.')
    return
  }

  let targetAgents: AgentConfig[] = []
  if (allArg) {
    targetAgents = config.agents.filter((a) => a.enabled)
  } else if (targetArg) {
    const targetName = targetArg.split('=')[1].toLowerCase()
    targetAgents = config.agents.filter((a) => a.name.toLowerCase().includes(targetName))
  }

  if (targetAgents.length === 0) {
    console.error('No matching agents found to sync to.')
    return
  }

  const skills = await fs.readdir(hubPath)
  console.log(`Found ${skills.length} skills in Hub. Syncing to ${targetAgents.length} agents...`)

  for (const agent of targetAgents) {
    console.log(`\nSyncing to Agent: ${agent.name} (${agent.globalPath})...`)

    for (const skill of skills) {
      const skillSource = path.join(hubPath, skill)
      if (!(await fs.stat(skillSource)).isDirectory()) continue

      // Expand ~ in path
      let destRoot = agent.globalPath
      if (destRoot.startsWith('~')) {
        destRoot = path.join(os.homedir(), destRoot.slice(1))
      }

      const skillDest = path.join(destRoot, skill)

      try {
        await fs.ensureDir(destRoot)
        await fs.copy(skillSource, skillDest, { overwrite: true })
        console.log(`  [OK] ${skill} -> ${skillDest}`)
      } catch (err) {
        console.error(`  [ERR] Failed to sync ${skill}:`, err)
      }
    }
  }
  console.log('\nSync complete.')
}

async function handleImport(args: string[]) {
  const url = args[0]
  if (!url) {
    console.error('Error: Missing URL for import.')
    console.log('Usage: skills-hub import <url>')
    process.exit(1)
  }

  console.log(`Processing import for: ${url}`)

  const { repoUrl, repoWebUrl, subdir, skillName, branch } = parseSkillImportUrl(url)
  const config = await getConfig()
  const destPath = path.join(config.hubPath, skillName)

  console.log(`  Repo: ${repoUrl}`)
  console.log(`  Subdir: ${subdir || '(root)'}`)
  console.log(`  Target: ${destPath}`)

  if (await fs.pathExists(destPath)) {
    console.error(`Error: Skill '${skillName}' already exists at ${destPath}`)
    // In real CLI we would ask to overwrite or logic for update
    process.exit(1)
  }

  const downloadResult = await downloadRemoteSkill(repoUrl, subdir, destPath, branch)
  const sourceUrl = buildGitSourceUrl(repoWebUrl, downloadResult.resolvedBranch, subdir)
  await attachSkillImportMetadata(destPath, {
    sourceRepo: repoWebUrl,
    sourceUrl,
    sourceBranch: downloadResult.resolvedBranch,
    sourceSubdir: subdir,
    sourceLastUpdated: downloadResult.lastUpdatedAt,
    importedAt: new Date().toISOString(),
  })

  console.log(`Successfully imported ${skillName} from ${repoWebUrl}!`)
  console.log(`Source last updated: ${downloadResult.lastUpdatedAt}`)
}

async function handleList() {
  const config = await getConfig()
  const hubPath = config.hubPath

  console.log(`Listing skills in ${hubPath}:`)
  if (!(await fs.pathExists(hubPath))) {
    console.log('  (Hub directory does not exist yet)')
    return
  }

  const items = await fs.readdir(hubPath)
  for (const item of items) {
    const fullPath = path.join(hubPath, item)
    const stat = await fs.stat(fullPath)
    if (stat.isDirectory()) {
      console.log(`  - ${item}`)
    }
  }
}

main()
