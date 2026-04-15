<script setup lang="ts">
import type { ProjectIssue, ProjectResourceShare, Resource } from '~~/shared/types/domain'

type FinalReviewChecklistStatus = 'pass' | 'warning' | 'missing'

interface FinalReviewChecklistItem {
  id: string
  title: string
  description: string
  status: FinalReviewChecklistStatus
  blocker?: boolean
}

const props = withDefaults(defineProps<{
  contestName?: string
  trackName?: string
  readinessPercent?: number
  resourceCount?: number
  activeShareCount?: number
  unresolvedIssueCount?: number
  checklistItems?: FinalReviewChecklistItem[]
  riskSummary?: string
  openIssues?: ProjectIssue[]
  evidenceGaps?: string[]
  resources?: Resource[]
  shares?: ProjectResourceShare[]
  draftTitle?: string
  draftProblemStatement?: string
  draftSummary?: string
}>(), {
  contestName: '',
  trackName: '',
  readinessPercent: 0,
  resourceCount: 0,
  activeShareCount: 0,
  unresolvedIssueCount: 0,
  checklistItems: () => [],
  riskSummary: '',
  openIssues: () => [],
  evidenceGaps: () => [],
  resources: () => [],
  shares: () => [],
  draftTitle: '',
  draftProblemStatement: '',
  draftSummary: '',
})

const emit = defineEmits<{
  openFinalReviewFlow: []
  openProjectSettings: []
  openDashboard: []
  openMaterials: []
  switchDefense: []
}>()

const checklistStatusMeta: Record<FinalReviewChecklistStatus, { label: string, badgeClass: string, dotClass: string }> = {
  pass: {
    label: '通过',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  warning: {
    label: '警告',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  missing: {
    label: '缺失',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    dotClass: 'bg-rose-500',
  },
}

const readinessPercentLabel = computed(() => {
  const normalized = Number.isFinite(props.readinessPercent) ? Number(props.readinessPercent) : 0
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`
})

const readinessCaption = computed(() => {
  const value = Number(props.readinessPercent || 0)
  if (value >= 84)
    return '终审条件已基本齐备，可集中做最后核验。'
  if (value >= 60)
    return '核心材料已有基础，仍需补齐风险和证据链。'
  return '当前仍处于补资料阶段，建议先清空缺失项。'
})

const visibleIssues = computed(() => props.openIssues.slice(0, 4))
const visibleResources = computed(() => props.resources.slice(0, 5))
const visibleShares = computed(() => props.shares.slice(0, 4))
</script>

<template>
  <section
    data-testid="workspace-final-review-workbench"
    class="workspace-final-review-workbench"
  >
    <section class="workspace-final-review-workbench__hero">
      <div class="space-y-3">
        <span class="workspace-final-review-workbench__eyebrow">终审驾驶舱</span>
        <div class="space-y-1.5">
          <h1 class="workspace-final-review-workbench__title">
            {{ contestName || '未选择竞赛' }}
            <span class="workspace-final-review-workbench__title-separator">/</span>
            {{ trackName || '未选择赛道' }}
          </h1>
          <p class="workspace-final-review-workbench__summary">
            第一屏只聚焦审查清单、风险与动作入口。流程画布、资料与答辩能力都保留为显式动作，不再作为默认壳子。
          </p>
        </div>
      </div>

      <div class="workspace-final-review-workbench__stats">
        <article class="workspace-final-review-workbench__stat">
          <span class="workspace-final-review-workbench__stat-label">Readiness</span>
          <strong class="workspace-final-review-workbench__stat-value">{{ readinessPercentLabel }}</strong>
          <p class="workspace-final-review-workbench__stat-note">
            {{ readinessCaption }}
          </p>
        </article>
        <article class="workspace-final-review-workbench__stat">
          <span class="workspace-final-review-workbench__stat-label">资料数</span>
          <strong class="workspace-final-review-workbench__stat-value">{{ resourceCount }}</strong>
          <p class="workspace-final-review-workbench__stat-note">
            已关联到研发工作台的送审资料。
          </p>
        </article>
        <article class="workspace-final-review-workbench__stat">
          <span class="workspace-final-review-workbench__stat-label">有效共享</span>
          <strong class="workspace-final-review-workbench__stat-value">{{ activeShareCount }}</strong>
          <p class="workspace-final-review-workbench__stat-note">
            当前未撤销、仍可供评审访问的共享链接。
          </p>
        </article>
        <article class="workspace-final-review-workbench__stat">
          <span class="workspace-final-review-workbench__stat-label">未解决 Issue</span>
          <strong class="workspace-final-review-workbench__stat-value">{{ unresolvedIssueCount }}</strong>
          <p class="workspace-final-review-workbench__stat-note">
            优先清空 critical / high 再进入终审提交。
          </p>
        </article>
      </div>
    </section>

    <section class="workspace-final-review-workbench__primary-grid">
      <article
        data-testid="workspace-final-review-checklist"
        class="workspace-final-review-workbench__panel"
      >
        <header class="workspace-final-review-workbench__panel-header">
          <div>
            <p class="workspace-final-review-workbench__panel-eyebrow">
              审查清单
            </p>
            <h2 class="workspace-final-review-workbench__panel-title">
              终审前置项
            </h2>
          </div>
          <span class="workspace-final-review-workbench__panel-meta">
            {{ checklistItems.length }} 项
          </span>
        </header>

        <ul class="workspace-final-review-workbench__list">
          <li
            v-for="item in checklistItems"
            :key="item.id"
            class="workspace-final-review-workbench__list-item"
          >
            <span
              class="workspace-final-review-workbench__list-dot"
              :class="checklistStatusMeta[item.status].dotClass"
            />
            <div class="workspace-final-review-workbench__list-content">
              <div class="flex gap-2 items-center flex-wrap">
                <strong class="workspace-final-review-workbench__list-title">{{ item.title }}</strong>
                <span
                  class="workspace-final-review-workbench__status-badge"
                  :class="checklistStatusMeta[item.status].badgeClass"
                >
                  {{ checklistStatusMeta[item.status].label }}
                </span>
                <span
                  v-if="item.blocker"
                  class="workspace-final-review-workbench__status-badge border-slate-200 bg-slate-50 text-slate-600"
                >
                  Blocker
                </span>
              </div>
              <p class="workspace-final-review-workbench__list-description">
                {{ item.description }}
              </p>
            </div>
          </li>
        </ul>
      </article>

      <article
        data-testid="workspace-final-review-risk-panel"
        class="workspace-final-review-workbench__panel"
      >
        <header class="workspace-final-review-workbench__panel-header">
          <div>
            <p class="workspace-final-review-workbench__panel-eyebrow">
              风险面板
            </p>
            <h2 class="workspace-final-review-workbench__panel-title">
              当前最需要补的风险
            </h2>
          </div>
        </header>

        <section class="space-y-3">
          <div class="workspace-final-review-workbench__risk-summary">
            {{ riskSummary || '尚未生成终审问题报告，建议先执行一轮寻疑并产出报告。' }}
          </div>

          <div class="space-y-2">
            <p class="workspace-final-review-workbench__subheading">
              高优先级未解决问题
            </p>
            <ul v-if="visibleIssues.length > 0" class="workspace-final-review-workbench__issue-list">
              <li
                v-for="issue in visibleIssues"
                :key="issue.id"
                class="workspace-final-review-workbench__issue-item"
              >
                <div class="flex gap-2 items-center flex-wrap">
                  <span class="workspace-final-review-workbench__issue-severity">
                    {{ issue.severity.toUpperCase() }}
                  </span>
                  <strong class="workspace-final-review-workbench__issue-title">{{ issue.title }}</strong>
                </div>
                <p class="workspace-final-review-workbench__issue-text">
                  {{ issue.evidence || issue.recommendation || '当前问题尚未补充证据与建议。' }}
                </p>
              </li>
            </ul>
            <p v-else class="workspace-final-review-workbench__empty">
              当前没有 critical / high 且未解决的问题。
            </p>
          </div>

          <div class="space-y-2">
            <p class="workspace-final-review-workbench__subheading">
              证据缺口
            </p>
            <ul v-if="evidenceGaps.length > 0" class="workspace-final-review-workbench__evidence-list">
              <li
                v-for="item in evidenceGaps"
                :key="item"
                class="workspace-final-review-workbench__evidence-item"
              >
                {{ item }}
              </li>
            </ul>
            <p v-else class="workspace-final-review-workbench__empty">
              当前指标对标里没有额外的 supporting note 缺口。
            </p>
          </div>
        </section>
      </article>

      <article
        data-testid="workspace-final-review-actions"
        class="workspace-final-review-workbench__panel"
      >
        <header class="workspace-final-review-workbench__panel-header">
          <div>
            <p class="workspace-final-review-workbench__panel-eyebrow">
              终审动作
            </p>
            <h2 class="workspace-final-review-workbench__panel-title">
              明确动作入口
            </h2>
          </div>
        </header>

        <div class="workspace-final-review-workbench__action-list">
          <button class="workspace-final-review-workbench__action workspace-final-review-workbench__action--primary" type="button" @click="emit('openFinalReviewFlow')">
            打开终审流程
          </button>
          <button class="workspace-final-review-workbench__action" type="button" @click="emit('openProjectSettings')">
            打开项目设置
          </button>
          <button class="workspace-final-review-workbench__action" type="button" @click="emit('openDashboard')">
            打开仪表盘对标
          </button>
          <button class="workspace-final-review-workbench__action" type="button" @click="emit('openMaterials')">
            打开资料抽屉
          </button>
          <button class="workspace-final-review-workbench__action workspace-final-review-workbench__action--accent" type="button" @click="emit('switchDefense')">
            切到答辩工作台
          </button>
        </div>
      </article>
    </section>

    <section class="workspace-final-review-workbench__secondary-grid">
      <article class="workspace-final-review-workbench__panel">
        <header class="workspace-final-review-workbench__panel-header">
          <div>
            <p class="workspace-final-review-workbench__panel-eyebrow">
              送审资料与共享
            </p>
            <h2 class="workspace-final-review-workbench__panel-title">
              当前送审面
            </h2>
          </div>
          <button class="workspace-final-review-workbench__inline-action" type="button" @click="emit('openMaterials')">
            查看全部
          </button>
        </header>

        <div class="workspace-final-review-workbench__overview-grid">
          <section class="space-y-2">
            <p class="workspace-final-review-workbench__subheading">
              项目资料
            </p>
            <ul v-if="visibleResources.length > 0" class="workspace-final-review-workbench__compact-list">
              <li
                v-for="resource in visibleResources"
                :key="resource.id"
                class="workspace-final-review-workbench__compact-item"
              >
                <strong>{{ resource.title }}</strong>
                <span>{{ resource.type || '资料' }}</span>
              </li>
            </ul>
            <p v-else class="workspace-final-review-workbench__empty">
              当前还没有关联项目资料。
            </p>
          </section>

          <section class="space-y-2">
            <p class="workspace-final-review-workbench__subheading">
              共享链接
            </p>
            <ul v-if="visibleShares.length > 0" class="workspace-final-review-workbench__compact-list">
              <li
                v-for="share in visibleShares"
                :key="share.id"
                class="workspace-final-review-workbench__compact-item"
              >
                <strong>{{ share.resourceTitle }}</strong>
                <span>{{ share.visibility }} · {{ share.duration }}</span>
              </li>
            </ul>
            <p v-else class="workspace-final-review-workbench__empty">
              当前还没有可用共享链接。
            </p>
          </section>
        </div>
      </article>

      <article class="workspace-final-review-workbench__panel">
        <header class="workspace-final-review-workbench__panel-header">
          <div>
            <p class="workspace-final-review-workbench__panel-eyebrow">
              提交草案摘要
            </p>
            <h2 class="workspace-final-review-workbench__panel-title">
              当前主叙事
            </h2>
          </div>
        </header>

        <div class="space-y-4">
          <section class="space-y-1.5">
            <p class="workspace-final-review-workbench__subheading">
              标题
            </p>
            <p class="workspace-final-review-workbench__draft-text">
              {{ draftTitle || '尚未填写项目标题。' }}
            </p>
          </section>

          <section class="space-y-1.5">
            <p class="workspace-final-review-workbench__subheading">
              问题定义
            </p>
            <p class="workspace-final-review-workbench__draft-text">
              {{ draftProblemStatement || '尚未填写问题定义。' }}
            </p>
          </section>

          <section class="space-y-1.5">
            <p class="workspace-final-review-workbench__subheading">
              摘要
            </p>
            <p class="workspace-final-review-workbench__draft-text">
              {{ draftSummary || '尚未填写摘要。' }}
            </p>
          </section>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.workspace-final-review-workbench {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.workspace-final-review-workbench__hero {
  border: 1px solid #d7e3f5;
  border-radius: 24px;
  padding: 22px 24px;
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.16), transparent 34%),
    linear-gradient(180deg, #f8fbff 0%, #f3f8ff 100%);
  display: grid;
  gap: 18px;
}

.workspace-final-review-workbench__eyebrow,
.workspace-final-review-workbench__panel-eyebrow,
.workspace-final-review-workbench__stat-label,
.workspace-final-review-workbench__subheading {
  display: block;
  color: #5272a3;
  font-size: 11px;
  line-height: 1.4;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.workspace-final-review-workbench__title {
  margin: 0;
  color: #0f172a;
  font-size: 28px;
  line-height: 1.1;
  font-weight: 700;
}

.workspace-final-review-workbench__title-separator {
  color: #7c94b8;
  font-weight: 500;
  margin: 0 2px;
}

.workspace-final-review-workbench__summary {
  margin: 0;
  max-width: 66ch;
  color: #4d6285;
  font-size: 14px;
  line-height: 1.7;
}

.workspace-final-review-workbench__stats {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.workspace-final-review-workbench__stat,
.workspace-final-review-workbench__panel {
  border: 1px solid #dbe5f3;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
}

.workspace-final-review-workbench__stat {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workspace-final-review-workbench__stat-value {
  color: #12213b;
  font-size: 24px;
  line-height: 1;
  font-weight: 700;
}

.workspace-final-review-workbench__stat-note {
  margin: 0;
  color: #5b708f;
  font-size: 12px;
  line-height: 1.6;
}

.workspace-final-review-workbench__primary-grid,
.workspace-final-review-workbench__secondary-grid {
  display: grid;
  gap: 16px;
}

.workspace-final-review-workbench__primary-grid {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(280px, 0.72fr);
}

.workspace-final-review-workbench__secondary-grid {
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
}

.workspace-final-review-workbench__panel {
  padding: 18px;
}

.workspace-final-review-workbench__panel-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}

.workspace-final-review-workbench__panel-title {
  margin: 4px 0 0;
  color: #12213b;
  font-size: 18px;
  line-height: 1.2;
  font-weight: 700;
}

.workspace-final-review-workbench__panel-meta {
  color: #5d7394;
  font-size: 12px;
  line-height: 1;
}

.workspace-final-review-workbench__list,
.workspace-final-review-workbench__issue-list,
.workspace-final-review-workbench__evidence-list,
.workspace-final-review-workbench__compact-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.workspace-final-review-workbench__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.workspace-final-review-workbench__list-item {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr);
  gap: 12px;
  align-items: flex-start;
}

.workspace-final-review-workbench__list-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  margin-top: 7px;
}

.workspace-final-review-workbench__list-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workspace-final-review-workbench__list-title,
.workspace-final-review-workbench__issue-title {
  color: #12213b;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 600;
}

.workspace-final-review-workbench__list-description,
.workspace-final-review-workbench__issue-text,
.workspace-final-review-workbench__draft-text,
.workspace-final-review-workbench__empty {
  margin: 0;
  color: #5b708f;
  font-size: 13px;
  line-height: 1.7;
}

.workspace-final-review-workbench__status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 11px;
  line-height: 1;
  font-weight: 600;
}

.workspace-final-review-workbench__risk-summary {
  border-radius: 16px;
  padding: 14px 15px;
  background: #f6f9ff;
  color: #324764;
  font-size: 13px;
  line-height: 1.8;
}

.workspace-final-review-workbench__issue-list,
.workspace-final-review-workbench__evidence-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-final-review-workbench__issue-item,
.workspace-final-review-workbench__evidence-item,
.workspace-final-review-workbench__compact-item {
  border-radius: 16px;
  border: 1px solid #e4ebf5;
  padding: 12px 13px;
  background: #fbfdff;
}

.workspace-final-review-workbench__issue-severity {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: #e9f1ff;
  color: #2454a7;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.workspace-final-review-workbench__action-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-final-review-workbench__action,
.workspace-final-review-workbench__inline-action {
  border: 1px solid #d9e2ef;
  background: #ffffff;
  color: #264061;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;
}

.workspace-final-review-workbench__action {
  min-height: 44px;
  border-radius: 14px;
  padding: 0 14px;
  font-size: 13px;
  line-height: 1;
  font-weight: 600;
  text-align: left;
}

.workspace-final-review-workbench__action:hover,
.workspace-final-review-workbench__inline-action:hover {
  border-color: #bcd0ee;
  background: #f7faff;
}

.workspace-final-review-workbench__action--primary {
  border-color: #2f65d6;
  background: #2563eb;
  color: #ffffff;
}

.workspace-final-review-workbench__action--primary:hover {
  border-color: #275acd;
  background: #1f58d9;
}

.workspace-final-review-workbench__action--accent {
  border-color: #e4c067;
  background: #fff6dd;
  color: #8d5a00;
}

.workspace-final-review-workbench__action--accent:hover {
  border-color: #d5ad4d;
  background: #ffefc2;
}

.workspace-final-review-workbench__inline-action {
  min-height: 32px;
  border-radius: 999px;
  padding: 0 12px;
  font-size: 12px;
  line-height: 1;
  font-weight: 600;
}

.workspace-final-review-workbench__overview-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.workspace-final-review-workbench__compact-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-final-review-workbench__compact-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.workspace-final-review-workbench__compact-item strong {
  color: #1b2c49;
  font-size: 13px;
  line-height: 1.5;
  font-weight: 600;
}

.workspace-final-review-workbench__compact-item span {
  color: #617593;
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 1280px) {
  .workspace-final-review-workbench__primary-grid,
  .workspace-final-review-workbench__secondary-grid,
  .workspace-final-review-workbench__stats,
  .workspace-final-review-workbench__overview-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
