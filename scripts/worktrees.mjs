import { execFile, spawn } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { parseGitWorktreeListPorcelain, selectSiblingWorktrees } from './utils/worktree-batch.mjs'

const execFileAsync = promisify(execFile)

const HELP_TEXT = `用法：
  pnpm worktrees:list [-- --include-current] [-- --name pr2,pr5]
  pnpm worktrees:status [-- --include-current] [-- --name pr2]
  pnpm worktrees:run [-- --include-current] [-- --name pr2,pr3] [-- --continue-on-error] -- <command> [args...]

说明：
  - 默认只处理当前仓库同级目录下、同名前缀的 sibling worktree，不包含当前仓库。
  - --name 支持短名、目录名或分支名，例如 pr2、touch-win-loop-pr2、pr2-sync。
  - 如需把当前仓库一起纳入批处理，请追加 --include-current。`

function formatCommand(commandArgs = []) {
  return commandArgs.map((part) => {
    const segment = String(part)
    return /\s/.test(segment) ? JSON.stringify(segment) : segment
  }).join(' ')
}

function printHelp() {
  console.log(HELP_TEXT)
}

function parseCliArgs(argv) {
  const args = [...argv]
  const command = args.shift() || 'list'
  const options = {
    includeCurrent: false,
    names: [],
    continueOnError: false,
  }
  const commandArgs = []

  while (args.length > 0) {
    const token = args.shift()

    if (token === '--') {
      const nextToken = args[0]
      const shouldTreatAsCommandSeparator = Boolean(
        command === 'run'
        && nextToken
        && !nextToken.startsWith('-'),
      )

      if (shouldTreatAsCommandSeparator) {
        commandArgs.push(...args)
        break
      }

      continue
    }

    if (token === '--help' || token === '-h')
      return { command: 'help', options, commandArgs }

    if (token === '--include-current') {
      options.includeCurrent = true
      continue
    }

    if (token === '--continue-on-error') {
      options.continueOnError = true
      continue
    }

    if (token === '--name') {
      const value = args.shift()
      if (!value)
        throw new Error('--name 需要一个值')
      options.names.push(value)
      continue
    }

    if (token.startsWith('--name=')) {
      options.names.push(token.slice('--name='.length))
      continue
    }

    throw new Error(`未知参数：${token}`)
  }

  return { command, options, commandArgs }
}

async function resolveRepoRoot(cwd) {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    maxBuffer: 1024 * 1024,
  })

  return stdout.trim()
}

async function discoverWorktrees(rootPath, options) {
  const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
    cwd: rootPath,
    maxBuffer: 4 * 1024 * 1024,
  })

  return selectSiblingWorktrees(parseGitWorktreeListPorcelain(stdout), rootPath, options)
}

async function readWorktreeStatus(worktreePath) {
  const { stdout } = await execFileAsync('git', ['status', '--short', '--branch'], {
    cwd: worktreePath,
    maxBuffer: 4 * 1024 * 1024,
  })

  const lines = stdout.trimEnd().split(/\r?\n/).filter(Boolean)
  const branchLine = lines.find(line => line.startsWith('##')) || ''
  const dirtyLines = lines.filter(line => !line.startsWith('##'))

  return {
    branchLine,
    lines,
    dirty: dirtyLines.length > 0,
    dirtyCount: dirtyLines.length,
  }
}

function printList(worktrees, statuses, options) {
  const scopeLabel = options.includeCurrent ? '含当前仓库' : '默认不含当前仓库'
  console.log(`已发现 ${worktrees.length} 个 sibling worktree（${scopeLabel}）`)

  if (worktrees.length === 0)
    return

  const rows = worktrees.map((worktree, index) => {
    const status = statuses[index]
    return {
      id: worktree.id,
      branch: worktree.branch || '(detached)',
      role: worktree.role,
      state: status.dirty ? `dirty(${status.dirtyCount})` : 'clean',
      head: worktree.head.slice(0, 7) || '-',
      path: worktree.path,
    }
  })

  const widths = {
    id: Math.max('ID'.length, ...rows.map(row => row.id.length)),
    branch: Math.max('分支'.length, ...rows.map(row => row.branch.length)),
    role: Math.max('类型'.length, ...rows.map(row => row.role.length)),
    state: Math.max('状态'.length, ...rows.map(row => row.state.length)),
    head: Math.max('HEAD'.length, ...rows.map(row => row.head.length)),
  }

  console.log(
    `${'ID'.padEnd(widths.id)}  ${'分支'.padEnd(widths.branch)}  ${'类型'.padEnd(widths.role)}  ${'状态'.padEnd(widths.state)}  ${'HEAD'.padEnd(widths.head)}  路径`,
  )

  for (const row of rows) {
    console.log(
      `${row.id.padEnd(widths.id)}  ${row.branch.padEnd(widths.branch)}  ${row.role.padEnd(widths.role)}  ${row.state.padEnd(widths.state)}  ${row.head.padEnd(widths.head)}  ${row.path}`,
    )
  }
}

function printDetailedStatus(worktrees, statuses, options) {
  const scopeLabel = options.includeCurrent ? '含当前仓库' : '默认不含当前仓库'
  console.log(`已发现 ${worktrees.length} 个 sibling worktree（${scopeLabel}）`)

  if (worktrees.length === 0)
    return

  for (const [index, worktree] of worktrees.entries()) {
    const status = statuses[index]
    console.log(`\n== ${worktree.id} | ${worktree.branch || '(detached)'} | ${worktree.path} ==`)
    if (status.lines.length === 0)
      console.log('工作区为空状态')
    else
      console.log(status.lines.join('\n'))
  }
}

async function runInWorktree(worktree, commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandArgs[0], commandArgs.slice(1), {
      cwd: worktree.path,
      env: process.env,
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => resolve({ code: code ?? 0, signal }))
  })
}

async function runCommand(worktrees, commandArgs, options) {
  if (commandArgs.length === 0)
    throw new Error('run 命令后必须通过 -- 传入要执行的命令')

  const failures = []

  for (const [index, worktree] of worktrees.entries()) {
    console.log(`\n[${index + 1}/${worktrees.length}] ${worktree.id} | ${worktree.branch || '(detached)'} | ${worktree.path}`)
    console.log(`$ ${formatCommand(commandArgs)}`)

    const result = await runInWorktree(worktree, commandArgs)
    if (!result.signal && result.code === 0)
      continue

    failures.push({
      worktree,
      code: result.code,
      signal: result.signal,
    })

    const reason = result.signal ? `信号 ${result.signal}` : `退出码 ${result.code}`
    console.error(`命令执行失败：${worktree.id}（${reason}）`)

    if (!options.continueOnError) {
      process.exitCode = result.code || 1
      return
    }
  }

  if (failures.length > 0) {
    console.error(`\n共有 ${failures.length} 个 worktree 执行失败。`)
    process.exitCode = failures.at(-1)?.code || 1
    return
  }

  console.log(`\n全部 ${worktrees.length} 个 worktree 执行完成。`)
}

async function main() {
  const { command, options, commandArgs } = parseCliArgs(process.argv.slice(2))
  if (command === 'help') {
    printHelp()
    return
  }

  if (!['list', 'status', 'run'].includes(command))
    throw new Error(`未知命令：${command}`)

  const rootPath = await resolveRepoRoot(process.cwd())
  const worktrees = await discoverWorktrees(rootPath, options)

  if (command === 'list') {
    const statuses = await Promise.all(worktrees.map(worktree => readWorktreeStatus(worktree.path)))
    printList(worktrees, statuses, options)
    return
  }

  if (command === 'status') {
    const statuses = await Promise.all(worktrees.map(worktree => readWorktreeStatus(worktree.path)))
    printDetailedStatus(worktrees, statuses, options)
    return
  }

  await runCommand(worktrees, commandArgs, options)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  printHelp()
  process.exitCode = 1
})
