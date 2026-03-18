import type {
  Project,
  ProjectPayload,
  ProjectSource,
  ProjectStatus,
} from '~~/shared/types/domain'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const STORE_PATH = resolve(process.cwd(), 'server/storage/projects.json')

async function ensureStoreReady() {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  try {
    await access(STORE_PATH)
  }
  catch {
    await writeFile(STORE_PATH, '[]\n', 'utf8')
  }
}

async function readProjectsRaw(): Promise<Project[]> {
  await ensureStoreReady()
  const content = await readFile(STORE_PATH, 'utf8')
  const parsed = JSON.parse(content) as unknown
  if (!Array.isArray(parsed))
    return []
  return parsed as Project[]
}

async function writeProjectsRaw(projects: Project[]) {
  await writeFile(STORE_PATH, `${JSON.stringify(projects, null, 2)}\n`, 'utf8')
}

export async function listLegacyProjects(): Promise<Project[]> {
  const projects = await readProjectsRaw()
  return projects.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))
}

export async function getLegacyProjectById(projectId: string): Promise<Project | undefined> {
  const projects = await readProjectsRaw()
  return projects.find(project => project.id === projectId)
}

interface CreateProjectInput extends ProjectPayload {
  workspaceId: string
  ownerUserId: string
  creatorUserId: string
  payerUserId?: string | null
  source: ProjectSource
  status?: ProjectStatus
}

export async function createLegacyProject(input: CreateProjectInput): Promise<Project> {
  const projects = await readProjectsRaw()
  const now = new Date().toISOString()

  const project: Project = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
    creatorUserId: input.creatorUserId,
    payerUserId: input.payerUserId || null,
    title: input.title,
    contestId: input.contestId,
    trackId: input.trackId,
    problemStatement: input.problemStatement,
    innovationPoints: input.innovationPoints,
    techRouteSteps: input.techRouteSteps,
    scoringMapping: input.scoringMapping,
    risks: input.risks,
    deliverables: input.deliverables,
    summary: input.summary,
    source: input.source,
    status: input.status ?? 'draft',
    collegeBindings: [],
    advisorBindings: [],
    createdAt: now,
    updatedAt: now,
  }

  projects.push(project)
  await writeProjectsRaw(projects)
  return project
}
