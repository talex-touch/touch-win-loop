import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const PAGE_FILE = resolve(process.cwd(), 'app/pages/admin/storage-service.vue')
const LAYOUT_FILE = resolve(process.cwd(), 'app/layouts/admin.vue')
const ADMIN_INDEX_FILE = resolve(process.cwd(), 'app/pages/admin/index.vue')
const RUNTIME_SETTINGS_FILE = resolve(process.cwd(), 'app/pages/admin/runtime-settings.vue')

it('admin 导航与首页暴露存储服务入口，运行设置不再渲染入口', async () => {
  const [layout, adminIndex, runtimeSettings] = await Promise.all([
    readFile(LAYOUT_FILE, 'utf8'),
    readFile(ADMIN_INDEX_FILE, 'utf8'),
    readFile(RUNTIME_SETTINGS_FILE, 'utf8'),
  ])

  assert.match(layout, /key: 'admin-storage-service'/, 'admin 左侧导航缺少存储服务菜单')
  assert.match(layout, /to: '\/admin\/storage-service'/, 'admin 左侧导航未指向 /admin/storage-service')
  assert.match(adminIndex, /key: 'storage-service'/, '管理首页缺少存储服务入口')
  assert.match(adminIndex, /to: '\/admin\/storage-service'/, '管理首页存储服务入口路径错误')
  assert.doesNotMatch(runtimeSettings, /\/admin\/storage-service/, '运行设置页仍渲染存储服务入口')
  assert.doesNotMatch(runtimeSettings, /存储服务/, '运行设置页仍渲染存储服务卡片')
})

it('运行设置页不再渲染旧对象存储配置表单', async () => {
  const source = await readFile(RUNTIME_SETTINGS_FILE, 'utf8')

  assert.doesNotMatch(source, /v-model="form\.storage\./, '运行设置页仍渲染旧 storage 表单')
  assert.doesNotMatch(source, /buildStoragePayload/, '运行设置页仍提交旧 storage payload')
  assert.doesNotMatch(source, /runtime-settings\/storage-test/, '运行设置页仍调用旧 storage-test')
})

it('存储服务页面包含概览、图表、渠道配置、排行与探针', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /\/admin\/storage-service/, '页面未请求存储服务接口')
  assert.match(source, /\/admin\/storage-service\/test/, '页面未请求存储探针接口')
  assert.match(source, /总存储量/, '页面缺少总存储量 KPI')
  assert.match(source, /当前写入渠道/, '页面缺少当前写入渠道 KPI')
  assert.match(source, /30 天上传/, '页面缺少上传流量 KPI')
  assert.match(source, /30 天下载/, '页面缺少下载流量 KPI')
  assert.match(source, /渠道占比/, '页面缺少渠道占比图')
  assert.match(source, /上传 \/ 下载趋势/, '页面缺少趋势图')
  assert.match(source, /渠道配置/, '页面缺少渠道配置表')
  assert.match(source, /用户下载排行/, '页面缺少用户下载排行')
  assert.match(source, /工作空间消耗/, '页面缺少工作空间消耗排行')
  assert.match(source, /测试连接/, '页面缺少渠道测试按钮')
})

it('渠道配置以列表行展示并支持点开详情', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /storage-channel-row/, '渠道配置未使用列表行结构')
  assert.match(source, /toggleChannelExpanded\(channel\.id\)/, '渠道列表缺少展开详情交互')
  assert.match(source, /isChannelExpanded\(channel\.id\)/, '渠道详情未按展开状态渲染')
  assert.match(source, /storage-channel-detail/, '渠道详情区域缺失')
})

it('渠道配置支持容量、水位、启用状态、优先级与密钥模式', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /v-model="channel\.enabled"/, '渠道配置缺少启用状态')
  assert.match(source, /v-model="channel\.priority"/, '渠道配置缺少优先级')
  assert.match(source, /v-model="channel\.capacityBytes"/, '渠道配置缺少容量上限')
  assert.match(source, /v-model="channel\.watermarkPercent"/, '渠道配置缺少水位阈值')
  assert.match(source, /v-model="channel\.accessKeyMode"/, '渠道配置缺少 accessKey 模式')
  assert.match(source, /v-model="channel\.secretKeyMode"/, '渠道配置缺少 secretKey 模式')
  assert.match(source, /channel\.id === 'local'/, '页面未保护默认 local 渠道')
  assert.match(source, /capacityBytes: 0/, '新增渠道未默认不限容量')
  assert.match(source, /watermarkPercent: 90/, '新增渠道未默认 90 水位')
})

it('存储服务页面使用 SVG/CSS 图表且未新增图表依赖', async () => {
  const source = await readFile(PAGE_FILE, 'utf8')

  assert.match(source, /<svg class="storage-trend"/, '趋势图未使用 SVG')
  assert.match(source, /conic-gradient/, '占比图未使用 CSS conic-gradient')
  assert.doesNotMatch(source, /chart\.js|echarts|apexcharts|recharts/i, '页面不应新增图表依赖')
  assert.doesNotMatch(source, /hero|landing/i, '后台页面不应出现落地页式 hero 结构')
})
