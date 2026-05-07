<script setup lang="ts">
definePageMeta({
  layout: 'admin',
})

const quickLinks = [
  {
    title: '发布审批队列',
    to: '/admin/releases/queue',
    description: '集中处理初审、随机二审、发布替换。',
  },
  {
    title: '飞书多维同步',
    to: '/admin/integrations/feishu',
    description: '配置主库、同步项、字段映射与回填列。',
  },
  {
    title: '政策库版本',
    to: '/admin/policies/releases',
    description: '查看政策库待审版本并完成发布。',
  },
  {
    title: '竞赛管理',
    to: '/admin/contests',
    description: '进入具体竞赛后查看该竞赛的版本发布页。',
  },
]

const publishSteps = [
  {
    title: '1. 飞书同步只会生成版本草稿',
    description: '管理员手动执行或定时执行飞书同步后，只会把竞赛库、赛道库、资料库、政策库写成待审版本，不会直接改线上内容。',
  },
  {
    title: '2. 初审管理员先看版本详情',
    description: '进入“发布审批队列”或单个竞赛/政策版本页，打开版本详情，对照快照、字段、审批日志后点击“初审通过”或“驳回”。',
  },
  {
    title: '3. 另一位管理员随机领取二审',
    description: '二审不能和初审是同一个人。管理员进入审批页点击“随机领取二审”，系统会随机分配一个他可审的版本，然后再决定通过或驳回。',
  },
  {
    title: '4. 通过二审后才能发布替换',
    description: '状态变成“待发布”后，具备发布权限的管理员点击“发布替换”。新版本会成为 published，旧 published 会自动转成 superseded。',
  },
  {
    title: '5. 每次发布都是版本更新',
    description: '线上永远只保留当前生效版本。后续飞书再次同步时，会重新进入草稿 -> 双人审批 -> 替换发布的流程。',
  },
]

const reviewRules = [
  '同步完成后，前台不会自动变化，必须人工审阅后发布。',
  '初审和二审必须是不同管理员。',
  '二审必须先点击“随机领取二审”，不能直接跳过领取。',
  '驳回会写入驳回原因，并记录到审批日志。',
  '发布会写审批日志，并替换旧发布版本，不会并存多个 published。',
]

const syncSteps = [
  '先到“飞书多维同步”配置主库和同步项。',
  '每个同步项先看字段概览，再补齐字段映射。',
  '竞赛库、赛道库的时间节点统一映射到 `timelineText`。',
  '资料库重点映射 `contestExternalId / trackExternalId / attachment / attachmentSummary`。',
  '政策库使用 `policy` 实体类型，映射会议名称、简介、日期和各平台资料链接。',
  '人设库使用 `persona` 实体类型，映射 `externalId / contestExternalId / object / persona1~5`，其中 `对象` 可以是比赛类型、具体赛事名或名人等自由文本。',
  '先点“预检”，确认模拟同步结果正确，再手动执行一次。',
]

const routeGuides = [
  {
    path: '/admin/releases/queue',
    meaning: '全局待审版本池。适合日常审批、随机领取二审、集中处理发布。',
  },
  {
    path: '/admin/contests/[id]/releases',
    meaning: '单个竞赛的版本历史。适合按竞赛逐个审查赛道、资料和时间节点变更。',
  },
  {
    path: '/admin/policies/releases',
    meaning: '政策库版本列表。适合处理会议/政策类资料的双人审批和发布。',
  },
  {
    path: '/admin/policies',
    meaning: '查看当前已经发布生效的政策库内容。',
  },
  {
    path: '/admin/integrations/feishu',
    meaning: '配置飞书多维同步信息、同步项、字段映射、回填与预检。',
  },
]

const faqItems = [
  {
    question: '为什么我刚同步完，前台内容没有变？',
    answer: '这是正常的。同步只会生成待审版本，必须经过初审、随机二审、手动发布后，线上内容才会更新。',
  },
  {
    question: '为什么二审按钮点不了或者审批失败？',
    answer: '二审必须先随机领取，而且二审人不能等于初审人。请先在审批页点击“随机领取二审”。',
  },
  {
    question: '发布后发现内容有误怎么办？',
    answer: '回到飞书修正数据后重新同步，再走一轮审批和发布。新发布会替换当前线上版本。',
  },
  {
    question: '审批记录在哪里看？',
    answer: '打开任一版本详情，底部就能看到审批日志，包括生成草稿、初审通过、领取二审、二审通过、驳回、发布。',
  },
  {
    question: '竞赛和政策为什么分成两个版本页？',
    answer: '竞赛版本会承载竞赛主表、赛道、赛道时间节点和资料；政策库是独立 scope，便于单独审批和发布。',
  },
  {
    question: '人设库里的“对象”字段怎么填？',
    answer: '对象是自由文本，可以写比赛类别、具体赛事名、名人名称等。系统会把它拼到导入后的人设名称里，例如“ICPC · 人设1”。',
  },
]
</script>

<template>
  <div class="space-y-4">
    <section class="p-4 border border-slate-200 rounded-lg bg-white">
      <div class="flex flex-wrap gap-2 items-center justify-between">
        <div>
          <h1 class="text-lg text-slate-900 font-semibold">
            管理员文档中心
          </h1>
          <p class="text-xs text-slate-500 mt-1">
            这里专门解释飞书同步、版本审批、随机二审、发布替换这套后台操作流程。遇到“同步了为什么没上线”这类问题，先看这里。
          </p>
        </div>
        <NuxtLink class="dense-btn" to="/admin/releases/queue">
          进入审批队列
        </NuxtLink>
      </div>
    </section>

    <section class="gap-3 grid md:grid-cols-2 xl:grid-cols-4">
      <NuxtLink
        v-for="item in quickLinks"
        :key="item.to"
        :to="item.to"
        class="p-4 border border-slate-200 rounded-lg bg-white hover:bg-slate-50"
      >
        <p class="text-sm text-slate-900 font-semibold">
          {{ item.title }}
        </p>
        <p class="text-xs text-slate-500 mt-2">
          {{ item.description }}
        </p>
      </NuxtLink>
    </section>

    <section class="border border-slate-200 rounded-lg bg-white overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h2 class="text-sm text-slate-900 font-semibold">
          发布审批到底怎么处理
        </h2>
      </div>
      <div class="p-4 space-y-3">
        <div v-for="item in publishSteps" :key="item.title" class="p-3 border border-slate-200 rounded-lg bg-white">
          <p class="text-sm text-slate-900 font-semibold">
            {{ item.title }}
          </p>
          <p class="text-xs text-slate-600 mt-2">
            {{ item.description }}
          </p>
        </div>
      </div>
    </section>

    <section class="gap-4 grid xl:grid-cols-[1.3fr_1fr]">
      <div class="border border-slate-200 rounded-lg bg-white overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h2 class="text-sm text-slate-900 font-semibold">
            飞书同步配置顺序
          </h2>
        </div>
        <div class="p-4 space-y-2">
          <div v-for="item in syncSteps" :key="item" class="text-xs text-slate-600 px-3 py-2 border border-slate-200 rounded bg-slate-50">
            {{ item }}
          </div>
        </div>
      </div>

      <div class="border border-slate-200 rounded-lg bg-white overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <h2 class="text-sm text-slate-900 font-semibold">
            审批规则
          </h2>
        </div>
        <div class="p-4 space-y-2">
          <div v-for="item in reviewRules" :key="item" class="text-xs text-slate-600 px-3 py-2 border border-slate-200 rounded bg-slate-50">
            {{ item }}
          </div>
        </div>
      </div>
    </section>

    <section class="border border-slate-200 rounded-lg bg-white overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h2 class="text-sm text-slate-900 font-semibold">
          后台页面怎么分工
        </h2>
      </div>
      <div class="divide-slate-200 divide-y">
        <div v-for="item in routeGuides" :key="item.path" class="p-4">
          <p class="text-sm text-slate-900 font-medium">
            {{ item.path }}
          </p>
          <p class="text-xs text-slate-500 mt-2">
            {{ item.meaning }}
          </p>
        </div>
      </div>
    </section>

    <section class="border border-slate-200 rounded-lg bg-white overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h2 class="text-sm text-slate-900 font-semibold">
          常见问题
        </h2>
      </div>
      <div class="p-4 space-y-3">
        <div v-for="item in faqItems" :key="item.question" class="p-3 border border-slate-200 rounded-lg bg-white">
          <p class="text-sm text-slate-900 font-semibold">
            {{ item.question }}
          </p>
          <p class="text-xs text-slate-600 mt-2">
            {{ item.answer }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
