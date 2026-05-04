import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, it } from 'vitest'

const execFileAsync = promisify(execFile)

const ROOT_DIR = process.cwd()
const DEPLOY_SCRIPT = resolve(ROOT_DIR, 'deploy/jenkins/deploy-winloop.sh')
const PIPELINE_FILE = resolve(ROOT_DIR, 'deploy/jenkins/pipeline.groovy')
const README_FILE = resolve(ROOT_DIR, 'deploy/jenkins/README.zh-CN.md')
const STUB_DIGEST = 'a'.repeat(64)
const IMAGE_REF = `ghcr.io/talex-touch/touch-win-loop@sha256:${STUB_DIGEST}`
const BUILD_COMMIT_SHA = '2c46a7231e58d5015e005c0cc244aae55330a585'
const PREVIOUS_COMMIT_SHA = '618c341b3b644e438820219cfc70658df15564b3'

async function fileExists(path) {
  try {
    await stat(path)
    return true
  }
  catch {
    return false
  }
}

async function writeExecutable(path, content) {
  await writeFile(path, content)
  await chmod(path, 0o755)
}

async function prepareDeployFixture({ curlExitCode = 0 } = {}) {
  const tempRoot = await mkdtemp(join(tmpdir(), 'winloop-jenkins-deploy-'))
  const binDir = join(tempRoot, 'bin')
  const deployBaseDir = join(tempRoot, 'deploy')
  const stagingDir = join(deployBaseDir, 'staging')
  const reportFile = join(tempRoot, 'deployment.json')
  const templateFile = join(tempRoot, 'compose.yaml')
  const lockRoot = join(tempRoot, 'locks')
  const dockerEnvLog = join(tempRoot, 'docker-env.log')

  await writeFile(templateFile, 'services:\n  winloop:\n    image: placeholder\n')
  await writeFile(join(tempRoot, '.keep'), '')
  await mkdir(binDir, { recursive: true })
  await mkdir(stagingDir, { recursive: true })
  await writeFile(join(stagingDir, 'deploy.env'), [
    'COMPOSE_PROJECT_NAME=touch-win-loop-staging',
    'SERVICE_NAME=winloop',
    'RUNTIME_ENV_FILE=.env.runtime',
    'HEALTHCHECK_URL=http://127.0.0.1:3511/api/health',
    'HEALTHCHECK_ATTEMPTS=1',
    'HEALTHCHECK_INTERVAL_SEC=1',
    'ROLLBACK_ON_FAILURE=false',
    'FORCE_RECREATE=true',
    'DB_MIGRATION_FILES=__none__.sql',
    'MEETING_LIVEKIT_HTTP_PORT=7880',
    'MEETING_LIVEKIT_TCP_PORT=7881',
    'MEETING_LIVEKIT_RTC_UDP_RANGE=50000-50100',
    '',
  ].join('\n'))
  await writeFile(join(stagingDir, '.env.runtime'), [
    'WINLOOP_PUBLIC_BASE_URL=https://staging.winloop.example',
    '',
  ].join('\n'))
  await writeFile(join(stagingDir, 'last-successful-deployment.json'), JSON.stringify({
    status: 'success',
    buildCommitSha: PREVIOUS_COMMIT_SHA,
  }, null, 2))

  await writeExecutable(join(binDir, 'docker'), `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "compose" && "$2" == "version" ]]; then
  echo "Docker Compose version v2.0.0"
  exit 0
fi
if [[ "$1" == "compose" ]]; then
  {
    printf 'MEETING_LIVEKIT_HTTP_PORT=%s\n' "\${MEETING_LIVEKIT_HTTP_PORT:-}"
    printf 'MEETING_LIVEKIT_TCP_PORT=%s\n' "\${MEETING_LIVEKIT_TCP_PORT:-}"
    printf 'MEETING_LIVEKIT_RTC_UDP_RANGE=%s\n' "\${MEETING_LIVEKIT_RTC_UDP_RANGE:-}"
  } >> "\${WINLOOP_DOCKER_ENV_LOG:-/dev/null}"
  for arg in "$@"; do
    if [[ "$arg" == "ps" ]]; then
      exit 0
    fi
  done
  exit 0
fi
if [[ "$1" == "inspect" ]]; then
  exit 0
fi
exit 0
`)
  await writeExecutable(join(binDir, 'curl'), `#!/usr/bin/env bash
exit ${curlExitCode}
`)

  return {
    binDir,
    deployBaseDir,
    dockerEnvLog,
    lockRoot,
    reportFile,
    stagingDir,
    tempRoot,
    templateFile,
  }
}

async function runDeploy(fixture) {
  return execFileAsync('bash', [
    DEPLOY_SCRIPT,
    '--env',
    'staging',
    '--image-ref',
    IMAGE_REF,
    '--build-version',
    'dev-123-2c46a72',
    '--build-commit-sha',
    BUILD_COMMIT_SHA,
  ], {
    env: {
      ...process.env,
      PATH: `${fixture.binDir}:${process.env.PATH}`,
      WINLOOP_DEPLOY_BASE_DIR: fixture.deployBaseDir,
      WINLOOP_DEPLOY_LOCK_ROOT: fixture.lockRoot,
      WINLOOP_DEPLOY_REPORT_FILE: fixture.reportFile,
      WINLOOP_DEPLOY_TEMPLATE_FILE: fixture.templateFile,
      WINLOOP_DOCKER_ENV_LOG: fixture.dockerEnvLog,
    },
  })
}

describe('jenkins deploy notification metadata', () => {
  it('deploy script writes public URL and updates successful state only after healthcheck success', async () => {
    const fixture = await prepareDeployFixture()
    try {
      await runDeploy(fixture)

      const report = JSON.parse(await readFile(fixture.reportFile, 'utf8'))
      const state = JSON.parse(await readFile(join(fixture.stagingDir, 'last-successful-deployment.json'), 'utf8'))
      const livekitConfig = await readFile(join(fixture.stagingDir, 'livekit.yaml'), 'utf8')
      const dockerEnvLog = await readFile(fixture.dockerEnvLog, 'utf8')

      assert.equal(report.status, 'success')
      assert.equal(report.publicBaseUrl, 'https://staging.winloop.example')
      assert.equal(report.previousSuccessfulCommitSha, PREVIOUS_COMMIT_SHA)
      assert.equal(state.status, 'success')
      assert.equal(state.publicBaseUrl, 'https://staging.winloop.example')
      assert.equal(state.buildCommitSha, BUILD_COMMIT_SHA)
      assert.match(livekitConfig, /^ {2}tcp_port: 17881$/m)
      assert.match(livekitConfig, /^ {2}port_range_start: 51000$/m)
      assert.match(livekitConfig, /^ {2}port_range_end: 51100$/m)
      assert.match(dockerEnvLog, /^MEETING_LIVEKIT_HTTP_PORT=17880$/m)
      assert.match(dockerEnvLog, /^MEETING_LIVEKIT_TCP_PORT=17881$/m)
      assert.match(dockerEnvLog, /^MEETING_LIVEKIT_RTC_UDP_RANGE=51000-51100$/m)
    }
    finally {
      await rm(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('deploy script keeps successful state unchanged when deployment fails', async () => {
    const fixture = await prepareDeployFixture({ curlExitCode: 22 })
    try {
      await assert.rejects(() => runDeploy(fixture))

      const report = JSON.parse(await readFile(fixture.reportFile, 'utf8'))
      const state = JSON.parse(await readFile(join(fixture.stagingDir, 'last-successful-deployment.json'), 'utf8'))

      assert.equal(report.status, 'failed')
      assert.equal(report.publicBaseUrl, 'https://staging.winloop.example')
      assert.equal(report.previousSuccessfulCommitSha, PREVIOUS_COMMIT_SHA)
      assert.equal(state.buildCommitSha, PREVIOUS_COMMIT_SHA)
    }
    finally {
      await rm(fixture.tempRoot, { recursive: true, force: true })
    }
  })

  it('pipeline notification text includes public URL and commit changes behavior', async () => {
    const pipeline = await readFile(PIPELINE_FILE, 'utf8')
    const readme = await readFile(README_FILE, 'utf8')

    assert.match(pipeline, /String buildCommitChanges\(script, String rawPreviousSha, String rawCurrentSha\)/)
    assert.match(pipeline, /git log \$\{shellQuote\(range\)\} --format=%h%x09%s%x09%an --no-merges -n 20/)
    assert.match(pipeline, /\.\.\. and \$\{total - lines\.size\(\)\} more/)
    assert.match(pipeline, /return "- \$\{shortenSha\(sha\)\} 当前发布提交"/)
    assert.match(pipeline, /resultLabel == '开始' \? '环境访问' : '访问地址'/)
    assert.match(pipeline, /resultLabel == '失败' \? '失败阶段' : '流程阶段'/)
    assert.match(pipeline, /lines << '变更列表：'/)
    assert.match(pipeline, /String previousSuccessfulCommitSha = String\.valueOf\(deploymentReport\.previousSuccessfulCommitSha/)
    assert.match(pipeline, /publicBaseUrl = String\.valueOf\(deploymentReport\.publicBaseUrl \?: publicBaseUrl\)\.trim\(\)/)

    assert.match(readme, /`WINLOOP_PUBLIC_BASE_URL` 是 Jenkins 发布通知里“环境访问 \/ 访问地址”的唯一来源/)
    assert.match(readme, /只有健康检查成功的发布才会更新 `last-successful-deployment\.json`/)
  })

  it('bootstrap files expose optional COMMIT_CHANGES fallback parameter', async () => {
    const stagingBootstrap = await readFile(resolve(ROOT_DIR, 'deploy/jenkins/job-bootstrap.groovy'), 'utf8')
    const productionBootstrap = await readFile(resolve(ROOT_DIR, 'deploy/jenkins/job-bootstrap-production.groovy'), 'utf8')

    assert.match(stagingBootstrap, /text\(name: 'COMMIT_CHANGES'/)
    assert.match(productionBootstrap, /text\(name: 'COMMIT_CHANGES'/)
  })

  it('deploy script declares expected report and state fields', async () => {
    const source = await readFile(DEPLOY_SCRIPT, 'utf8')

    assert.equal(await fileExists(DEPLOY_SCRIPT), true)
    assert.match(source, /"publicBaseUrl": os\.environ\.get\("REPORT_PUBLIC_BASE_URL", ""\)/)
    assert.match(source, /"previousSuccessfulCommitSha": os\.environ\.get\("REPORT_PREVIOUS_SUCCESSFUL_COMMIT_SHA", ""\)/)
    assert.match(source, /SUCCESS_STATE_FILE="\$\{WINLOOP_DEPLOY_SUCCESS_STATE_FILE:-\$\{TARGET_DIR\}\/last-successful-deployment\.json\}"/)
    assert.match(source, /if ! write_success_state "\$SUCCESS_STATE_FILE"; then/)
  })
})
