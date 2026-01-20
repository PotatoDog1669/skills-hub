import fs from 'fs-extra'
import path from 'path'
import matter from 'gray-matter'
import { getConfig } from './config'
import { Skill } from './skills-types'

async function isSkillDir(dirPath: string): Promise<boolean> {
  return fs.pathExists(path.join(dirPath, 'SKILL.md'))
}

async function parseSkill(dirPath: string): Promise<Partial<Skill>> {
  try {
    const content = await fs.readFile(path.join(dirPath, 'SKILL.md'), 'utf-8')
    const { data, content: markdownBody } = matter(content)
    let description = data.description || ''
    if (!description) {
      const firstLine = markdownBody.trim().split('\n')[0]
      description = firstLine ? firstLine.replace(/^#+\s*/, '') : ''
    }
    return {
      name: data.name || path.basename(dirPath),
      description: description.slice(0, 200),
    }
  } catch (_) {
    return {
      name: path.basename(dirPath),
      description: 'Error parsing SKILL.md',
    }
  }
}

async function scanDirForSkills(basePath: string, depth = 0): Promise<string[]> {
  if (depth > 3) return []
  if (!(await fs.pathExists(basePath))) return []
  const entries = await fs.readdir(basePath, { withFileTypes: true })
  const skillPaths: string[] = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(basePath, entry.name)
      if (await isSkillDir(fullPath)) {
        skillPaths.push(fullPath)
      } else {
        skillPaths.push(...(await scanDirForSkills(fullPath, depth + 1)))
      }
    }
  }
  return skillPaths
}

export async function getAllSkills(): Promise<Skill[]> {
  const config = await getConfig()
  const allSkills: Skill[] = []

  // Hub
  if (await fs.pathExists(config.hubPath)) {
    const hubSkillPaths = await scanDirForSkills(config.hubPath)
    for (const p of hubSkillPaths) {
      const meta = await parseSkill(p)
      allSkills.push({
        id: p,
        path: p,
        name: meta.name!,
        description: meta.description!,
        location: 'hub',
      })
    }
  }

  const activeAgents = config.agents.filter((a) => a.enabled)

  // Agent Globals
  for (const agent of activeAgents) {
    if (await fs.pathExists(agent.globalPath)) {
      const agentSkillPaths = await scanDirForSkills(agent.globalPath)
      for (const p of agentSkillPaths) {
        const meta = await parseSkill(p)
        allSkills.push({
          id: p,
          path: p,
          name: meta.name!,
          description: meta.description!,
          location: 'agent',
          agentName: agent.name,
        })
      }
    }
  }

  // Projects
  for (const projectPath of config.projects) {
    for (const agent of activeAgents) {
      const localPath = path.join(projectPath, agent.projectPath)
      if (await fs.pathExists(localPath)) {
        const projectSkillPaths = await scanDirForSkills(localPath)
        for (const p of projectSkillPaths) {
          const meta = await parseSkill(p)
          allSkills.push({
            id: p,
            path: p,
            name: meta.name!,
            description: meta.description!,
            location: 'project',
            agentName: agent.name,
            projectName: path.basename(projectPath),
          })
        }
      }
    }
  }

  return allSkills
}

export async function getSkillContent(skillPath: string): Promise<string | null> {
  try {
    const mdPath = path.join(skillPath, 'SKILL.md')
    if (await fs.pathExists(mdPath)) {
      return await fs.readFile(mdPath, 'utf-8')
    }
    return null
  } catch (error) {
    console.error('Error reading skill content:', error)
    return null
  }
}
