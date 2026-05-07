import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  classifyWorktree,
  getWorktreeAliases,
  getWorktreeId,
  parseGitWorktreeListPorcelain,
  selectSiblingWorktrees,
} from '../utils/worktree-batch.mjs'

const ROOT_PATH = '/Users/demo/Workspace/Projects/touch-win-loop'

const SAMPLE_PORCELAIN = `worktree /Users/demo/Workspace/Projects/touch-win-loop
HEAD 1111111111111111111111111111111111111111
branch refs/heads/dev

worktree /Users/demo/Workspace/Projects/touch-win-loop-pr2
HEAD 2222222222222222222222222222222222222222
branch refs/heads/pr2-sync

worktree /Users/demo/Workspace/Projects/touch-win-loop-recovery
HEAD 3333333333333333333333333333333333333333
branch refs/heads/codex/session-recovery-design

worktree /Users/demo/.codex/worktrees/eb36/touch-win-loop
HEAD 4444444444444444444444444444444444444444
branch refs/heads/codex/page-system-refactor

worktree /private/tmp/touch-win-loop-ci-lkNJpD
HEAD 5555555555555555555555555555555555555555
detached
prunable gitdir file points to non-existent location
`

describe('worktree-batch', () => {
  it('解析 git worktree porcelain 输出', () => {
    const worktrees = parseGitWorktreeListPorcelain(SAMPLE_PORCELAIN)

    assert.equal(worktrees.length, 5)
    assert.equal(worktrees[0].path, '/Users/demo/Workspace/Projects/touch-win-loop')
    assert.equal(worktrees[0].branch, 'dev')
    assert.equal(worktrees[1].branch, 'pr2-sync')
    assert.equal(worktrees[4].detached, true)
    assert.equal(worktrees[4].prunable, 'gitdir file points to non-existent location')
  })

  it('只选择当前仓库同级的 sibling worktree，并默认排除当前仓库', () => {
    const worktrees = parseGitWorktreeListPorcelain(SAMPLE_PORCELAIN)
    const selected = selectSiblingWorktrees(worktrees, ROOT_PATH)

    assert.deepEqual(selected.map(worktree => worktree.id), ['pr2', 'recovery'])
    assert.deepEqual(selected.map(worktree => worktree.role), ['pr', 'recovery'])
    assert.equal(selected.every(worktree => worktree.path.startsWith('/Users/demo/Workspace/Projects/')), true)
  })

  it('支持按短名、目录名和分支名过滤，并可显式纳入当前仓库', () => {
    const worktrees = parseGitWorktreeListPorcelain(SAMPLE_PORCELAIN)
    const selected = selectSiblingWorktrees(worktrees, ROOT_PATH, {
      includeCurrent: true,
      names: ['current,pr2-sync,touch-win-loop-recovery'],
    })

    assert.deepEqual(selected.map(worktree => worktree.id), ['current', 'pr2', 'recovery'])
    assert.equal(getWorktreeId(selected[0], ROOT_PATH), 'current')
    assert.equal(classifyWorktree(selected[1], ROOT_PATH), 'pr')
    assert.deepEqual([...getWorktreeAliases(selected[2], ROOT_PATH)].sort(), [
      'codex/session-recovery-design',
      'recovery',
      'touch-win-loop-recovery',
    ])
  })
})
