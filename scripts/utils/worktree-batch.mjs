import { basename, dirname, resolve } from 'node:path'

const BRANCH_PREFIX = 'refs/heads/'

function normalizeNameFilters(filters = []) {
  return new Set(
    filters
      .flatMap(filter => String(filter).split(','))
      .map(filter => filter.trim())
      .filter(Boolean),
  )
}

function worktreeSortRank(role) {
  if (role === 'current')
    return 0
  if (role === 'pr')
    return 1
  if (role === 'recovery')
    return 2
  return 3
}

function extractPrNumber(id) {
  const match = /^pr(\d+)$/i.exec(id)
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY
}

export function parseGitWorktreeListPorcelain(source = '') {
  const entries = []
  let currentEntry = null

  const pushCurrentEntry = () => {
    if (currentEntry?.path)
      entries.push(currentEntry)
    currentEntry = null
  }

  for (const rawLine of String(source).split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (!line) {
      pushCurrentEntry()
      continue
    }

    const spaceIndex = line.indexOf(' ')
    const key = spaceIndex === -1 ? line : line.slice(0, spaceIndex)
    const value = spaceIndex === -1 ? '' : line.slice(spaceIndex + 1)

    if (key === 'worktree') {
      pushCurrentEntry()
      currentEntry = {
        path: value,
        head: '',
        branch: '',
        detached: false,
        locked: false,
        prunable: false,
      }
      continue
    }

    if (!currentEntry)
      continue

    if (key === 'HEAD')
      currentEntry.head = value
    else if (key === 'branch')
      currentEntry.branch = value.startsWith(BRANCH_PREFIX) ? value.slice(BRANCH_PREFIX.length) : value
    else if (key === 'detached')
      currentEntry.detached = true
    else if (key === 'locked')
      currentEntry.locked = value || true
    else if (key === 'prunable')
      currentEntry.prunable = value || true
  }

  pushCurrentEntry()
  return entries
}

export function isSiblingWorktree(worktree, rootPath) {
  const normalizedRootPath = resolve(rootPath)
  const normalizedWorktreePath = resolve(worktree.path)
  const rootName = basename(normalizedRootPath)

  if (dirname(normalizedWorktreePath) !== dirname(normalizedRootPath))
    return false

  const worktreeName = basename(normalizedWorktreePath)
  return worktreeName === rootName || worktreeName.startsWith(`${rootName}-`)
}

export function getWorktreeId(worktree, rootPath) {
  const normalizedRootPath = resolve(rootPath)
  const normalizedWorktreePath = resolve(worktree.path)
  const rootName = basename(normalizedRootPath)
  const worktreeName = basename(normalizedWorktreePath)

  if (worktreeName === rootName)
    return 'current'
  if (!worktreeName.startsWith(`${rootName}-`))
    return worktreeName

  return worktreeName.slice(rootName.length + 1)
}

export function getWorktreeAliases(worktree, rootPath) {
  const aliases = new Set()
  const normalizedWorktreePath = resolve(worktree.path)
  aliases.add(basename(normalizedWorktreePath))
  aliases.add(getWorktreeId(worktree, rootPath))
  if (worktree.branch)
    aliases.add(worktree.branch)
  return aliases
}

export function classifyWorktree(worktree, rootPath) {
  const id = getWorktreeId(worktree, rootPath)

  if (id === 'current')
    return 'current'
  if (/^pr\d+$/i.test(id))
    return 'pr'
  if (id === 'recovery')
    return 'recovery'
  return 'sibling'
}

export function selectSiblingWorktrees(worktrees, rootPath, options = {}) {
  const normalizedRootPath = resolve(rootPath)
  const nameFilters = normalizeNameFilters(options.names)

  return worktrees
    .filter(worktree => isSiblingWorktree(worktree, normalizedRootPath))
    .map((worktree) => {
      const normalizedPath = resolve(worktree.path)
      const role = classifyWorktree(worktree, normalizedRootPath)
      const id = getWorktreeId(worktree, normalizedRootPath)

      return {
        ...worktree,
        path: normalizedPath,
        name: basename(normalizedPath),
        id,
        role,
        isCurrent: normalizedPath === normalizedRootPath,
      }
    })
    .filter(worktree => options.includeCurrent || !worktree.isCurrent)
    .filter((worktree) => {
      if (nameFilters.size === 0)
        return true

      for (const alias of getWorktreeAliases(worktree, normalizedRootPath)) {
        if (nameFilters.has(alias))
          return true
      }

      return false
    })
    .sort((left, right) => {
      const roleRankDelta = worktreeSortRank(left.role) - worktreeSortRank(right.role)
      if (roleRankDelta !== 0)
        return roleRankDelta

      if (left.role === 'pr' && right.role === 'pr')
        return extractPrNumber(left.id) - extractPrNumber(right.id)

      return left.id.localeCompare(right.id, 'zh-Hans-CN')
    })
}
