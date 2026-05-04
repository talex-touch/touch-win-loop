import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'

const ROOT_DIR = process.cwd()
const COMPOSE_FILE = resolve(ROOT_DIR, 'deploy/jenkins/compose.yaml')
const DEPLOY_SCRIPT = resolve(ROOT_DIR, 'deploy/jenkins/deploy-winloop.sh')
const DEPLOY_ENV_EXAMPLE = resolve(ROOT_DIR, 'deploy/jenkins/deploy.env.example')
const RUNTIME_ENV_EXAMPLE = resolve(ROOT_DIR, 'deploy/jenkins/.env.runtime.example')
const README_FILE = resolve(ROOT_DIR, 'deploy/jenkins/README.zh-CN.md')

describe('jenkins staging meeting stack', () => {
  it('compose template defines LiveKit and monitoring services behind the standard staging profile', async () => {
    const source = await readFile(COMPOSE_FILE, 'utf8')

    assert.match(source, /^\s{2}meeting-redis:/m, 'compose 缺少 meeting-redis 服务')
    assert.match(source, /^\s{2}livekit:/m, 'compose 缺少 livekit 服务')
    assert.match(source, /^\s{2}prometheus:/m, 'compose 缺少 prometheus 服务')
    assert.match(source, /^\s{2}node-exporter:/m, 'compose 缺少 node-exporter 服务')
    assert.match(source, /^\s{2}cadvisor:/m, 'compose 缺少 cadvisor 服务')
    assert.match(source, /profiles:[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s+- meeting/, '会议核心服务未挂到 meeting profile')
    assert.match(source, /profiles:[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s+- egress/, 'Egress 未使用独立 egress profile')
    assert.match(source, /\$\{MEETING_LIVEKIT_HTTP_PORT:-7880\}:7880\/tcp/, 'LiveKit HTTP 端口未标准化为 7880')
    assert.match(source, /\$\{MEETING_LIVEKIT_TCP_PORT:-7881\}:7881\/tcp/, 'LiveKit TCP 端口未标准化为 7881')
    assert.match(source, /\$\{MEETING_LIVEKIT_RTC_UDP_RANGE:-50000-50100\}:\$\{MEETING_LIVEKIT_RTC_UDP_RANGE:-50000-50100\}\/udp/, 'LiveKit UDP range 未使用 staging 默认端口段')
    assert.match(source, /expose:[\t\v\f\r \xA0\u1680-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s+- 9090\/tcp/, 'Prometheus 应只在容器网络暴露')
    assert.doesNotMatch(source, /MEETING_PROMETHEUS_HOST_PORT|127\.0\.0\.1:.*:9090\/tcp/, 'Prometheus 不应占用宿主端口')
    assert.match(source, /aliases:[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s+- meeting-prometheus/, 'Prometheus 缺少应用网络别名')
    assert.match(source, /aliases:[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s+- meeting-livekit/, 'LiveKit 缺少应用网络别名')
  })

  it('deploy script generates LiveKit and Prometheus configs during normal staging deployment', async () => {
    const source = await readFile(DEPLOY_SCRIPT, 'utf8')

    assert.match(source, /write_meeting_configs\(\)/, '部署脚本缺少会议配置生成函数')
    assert.match(source, /redis:[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s+address: meeting-redis:6379/, 'LiveKit 配置未指向内置 meeting Redis')
    assert.match(source, /webhook:[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s+api_key: \$\{MEETING_LIVEKIT_API_KEY\}/, 'LiveKit webhook 未复用 staging API key')
    assert.match(source, /\/api\/internal\/meetings\/provider-events/, 'LiveKit webhook 未指向应用内部会议事件接口')
    assert.match(source, /prometheus:[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s+port: 6789/, 'LiveKit 未开启 metrics 端口')
    assert.match(source, /job_name: livekit/, 'Prometheus 配置缺少 LiveKit target')
    assert.match(source, /job_name: node-exporter/, 'Prometheus 配置缺少 node-exporter target')
    assert.match(source, /job_name: cadvisor/, 'Prometheus 配置缺少 cAdvisor target')
    assert.match(source, /MEETING_STACK_ENABLED_DEFAULT="false"[\s\S]*DEPLOY_ENV" == "staging"[\s\S]*MEETING_STACK_ENABLED_DEFAULT="true"/, 'staging 未默认启用会议栈')
    assert.match(source, /MEETING_EGRESS_ENABLED="\$\(to_bool "\$\{MEETING_EGRESS_ENABLED:-false\}"\)"/, 'Egress 不应默认启用')
    assert.match(source, /profile_args=\(--profile meeting\)/, '部署会议栈未使用 meeting profile')
    assert.match(source, /profile_args\+=\(--profile egress\)/, 'Egress 启动未受 egress profile 控制')
    assert.match(source, /compose_with_meeting_profiles up -d/, '部署流程未启动会议 profile 服务')
  })

  it('examples document staging defaults and the app-to-Prometheus runtime URL', async () => {
    const deployEnv = await readFile(DEPLOY_ENV_EXAMPLE, 'utf8')
    const runtimeEnv = await readFile(RUNTIME_ENV_EXAMPLE, 'utf8')
    const readme = await readFile(README_FILE, 'utf8')

    assert.match(deployEnv, /^MEETING_STACK_ENABLED=true$/m, 'deploy.env.example 未默认启用 staging 会议栈')
    assert.match(deployEnv, /^MEETING_EGRESS_ENABLED=false$/m, 'deploy.env.example 未保持 Egress 默认关闭')
    assert.match(deployEnv, /^MEETING_LIVEKIT_HTTP_PORT=7880$/m, 'deploy.env.example 缺少 LiveKit HTTP 默认端口')
    assert.match(deployEnv, /^MEETING_LIVEKIT_RTC_UDP_RANGE=50000-50100$/m, 'deploy.env.example 缺少 LiveKit UDP 默认端口段')
    assert.match(runtimeEnv, /^WINLOOP_MEETING_RTC_PROVIDER=livekit$/m, '.env.runtime.example 未配置 livekit provider')
    assert.match(runtimeEnv, /^WINLOOP_MEETING_RTC_ROOM_PREFIX=staging-winloop$/m, '.env.runtime.example 未配置 staging 房间前缀')
    assert.match(runtimeEnv, /^WINLOOP_MEETING_MONITORING_PROMETHEUS_BASE_URL=http:\/\/meeting-prometheus:9090$/m, '.env.runtime.example 未配置容器网络内 Prometheus 地址')
    assert.match(readme, /标准 staging 部署会同时启动 LiveKit、meeting Redis、Prometheus、node-exporter、cAdvisor/, 'README 未说明标准 staging 自动启动会议监控栈')
    assert.doesNotMatch(deployEnv, /^MEETING_PROMETHEUS_HOST_PORT=/m, 'deploy.env.example 不应默认发布 Prometheus 宿主端口')
    assert.match(readme, /Prometheus 默认不发布宿主端口，仅通过容器网络 `meeting-prometheus:9090` 访问/, 'README 未说明 Prometheus 容器网络访问边界')
  })
})
