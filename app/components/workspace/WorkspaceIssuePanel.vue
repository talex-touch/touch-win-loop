<script setup lang="ts">
import type { ProjectIssue, ProjectIssueReport } from '~~/shared/types/domain'
import {
  formatDateTime,
  issueSeverityClass,
  issueSeverityLabel,
  latestIssueReport,
  visibleIssues,
} from '~/utils/workspace-left-sidebar-helpers'

const props = withDefaults(defineProps<{
  issueReports?: ProjectIssueReport[]
  projectIssues?: ProjectIssue[]
  issueLoading?: boolean
}>(), {
  issueReports: () => [],
  projectIssues: () => [],
  issueLoading: false,
})

const emit = defineEmits<{
  reloadIssues: []
}>()

const latestReport = computed(() => latestIssueReport(props.issueReports))
const issues = computed(() => visibleIssues(props.projectIssues))
</script>

<template>
  <div class="workspace-left-panel__feature">
    <div class="workspace-left-panel__body no-scrollbar">
      <section class="workspace-card">
        <div class="workspace-issue-panel__header">
          <h3>Issue 中心</h3>
          <button
            class="workspace-btn workspace-btn--ghost"
            :disabled="props.issueLoading"
            type="button"
            @click="emit('reloadIssues')"
          >
            {{ props.issueLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <p class="workspace-issue-panel__hint">
          自动汇总寻疑报告与结构化问题项，便于统一跟踪风险与改进动作。
        </p>

        <div v-if="latestReport" class="workspace-issue-report-card">
          <div class="workspace-issue-report-card__title">
            {{ latestReport.title }}
          </div>
          <p>{{ latestReport.summary || '暂无摘要。' }}</p>
          <div class="workspace-issue-report-card__meta">
            更新时间：{{ formatDateTime(latestReport.updatedAt || latestReport.createdAt) }}
          </div>
        </div>
        <div v-else class="workspace-empty-text">
          尚未生成 issue 报告，先在右侧切到“寻疑发现”执行一次扫描。
        </div>
      </section>

      <section class="workspace-card">
        <h3>问题条目（{{ issues.length }}）</h3>
        <div v-if="issues.length === 0" class="workspace-empty-text">
          暂无问题条目。
        </div>
        <div v-else class="workspace-issue-list no-scrollbar">
          <article
            v-for="issue in issues"
            :key="issue.id"
            class="workspace-issue-item"
          >
            <div class="workspace-issue-item__head">
              <span class="workspace-issue-item__title">{{ issue.title }}</span>
              <span :class="issueSeverityClass(issue.severity)">
                {{ issueSeverityLabel(issue.severity) }}
              </span>
            </div>
            <p class="workspace-issue-item__line">
              证据：{{ issue.evidence || '暂无' }}
            </p>
            <p class="workspace-issue-item__line workspace-issue-item__line--suggestion">
              建议：{{ issue.recommendation || '暂无' }}
            </p>
            <p class="workspace-issue-item__meta">
              状态：{{ issue.status }} · {{ formatDateTime(issue.updatedAt || issue.createdAt) }}
            </p>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
