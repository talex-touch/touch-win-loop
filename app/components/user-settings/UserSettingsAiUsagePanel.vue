<script setup lang="ts">
import type { WorkspaceAiUsageHistory, WorkspaceWithQuota } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  currentWorkspace?: WorkspaceWithQuota | null
  aiQuotaHeadlineText?: string
  aiQuotaUsageText?: string
  aiQuotaUsedCount?: number
  aiQuotaRemainingCount?: number
  quotaResetCycleText?: string
  quotaUpdatedAtText?: string
  aiUsage?: WorkspaceAiUsageHistory | null
  aiUsageError?: string
  aiUsageLoading?: boolean
  aiUsagePage?: number
  aiUsageTotalPages?: number
  aiUsageMemberSummaries?: WorkspaceAiUsageHistory['memberSummaries']
  aiUsageHistoryItems?: WorkspaceAiUsageHistory['items']
  resolveInitial: (value: string | null | undefined) => string
  resolveMemberUsagePercent: (member: WorkspaceAiUsageHistory['memberSummaries'][number]) => string
  resolveMemberUsageBarStyle: (member: WorkspaceAiUsageHistory['memberSummaries'][number]) => { width: string }
  formatAiRouteLabel: (routeValue: string | null | undefined) => string
  formatDateTime: (value: string) => string
}>(), {
  currentWorkspace: null,
  aiQuotaHeadlineText: '未配置',
  aiQuotaUsageText: '暂无可用配额数据',
  aiQuotaUsedCount: 0,
  aiQuotaRemainingCount: 0,
  quotaResetCycleText: '',
  quotaUpdatedAtText: '',
  aiUsage: null,
  aiUsageError: '',
  aiUsageLoading: false,
  aiUsagePage: 1,
  aiUsageTotalPages: 1,
  aiUsageMemberSummaries: () => [],
  aiUsageHistoryItems: () => [],
})

const emit = defineEmits<{
  handleAiQuotaAction: []
  changeAiUsagePage: [nextPage: number]
}>()
</script>

<template>
  <div class="user-settings-panel user-settings-panel--stack">
    <template v-if="props.currentWorkspace">
      <section class="user-settings-card">
        <div class="flex gap-4 items-start justify-between">
          <div class="min-w-0">
            <p class="user-settings-copy">
              AI 配额
            </p>
            <div class="mt-2 flex gap-2 items-end">
              <p class="user-settings-ai-headline">
                {{ props.aiQuotaHeadlineText.replace(' credits', '') }}
              </p>
              <span class="user-settings-ai-unit">credits</span>
            </div>
            <p class="user-settings-copy mt-2">
              已用 {{ props.aiQuotaUsageText }}，剩余 {{ props.aiQuotaRemainingCount }} credits
            </p>
          </div>
          <button class="user-settings-plus-btn" title="调整 AI 配额" @click="emit('handleAiQuotaAction')">
            +
          </button>
        </div>

        <div class="user-settings-metric-grid">
          <div class="user-settings-mini-card">
            <p class="user-settings-mini-card__label">
              已用配额
            </p>
            <p class="user-settings-mini-card__value">
              {{ props.aiQuotaUsedCount }} credits
            </p>
          </div>
          <div class="user-settings-mini-card">
            <p class="user-settings-mini-card__label">
              剩余配额
            </p>
            <p class="user-settings-mini-card__value">
              {{ props.aiQuotaRemainingCount }} credits
            </p>
          </div>
          <div class="user-settings-mini-card">
            <p class="user-settings-mini-card__label">
              下次重置周期
            </p>
            <p class="user-settings-mini-card__value">
              {{ props.quotaResetCycleText }}
            </p>
          </div>
        </div>
      </section>

      <section class="user-settings-card">
        <div class="user-settings-section-header">
          <div>
            <p class="user-settings-section-title">
              配额同步记录
            </p>
            <p class="user-settings-copy mt-1">
              当前展示最近一次配额同步时间。
            </p>
          </div>
        </div>
        <div class="user-settings-record-item">
          <div class="min-w-0">
            <p class="user-settings-name">
              最近一次同步
            </p>
            <p class="user-settings-copy mt-1">
              {{ props.quotaUpdatedAtText }}
            </p>
          </div>
        </div>
      </section>

      <section class="user-settings-card">
        <div class="user-settings-section-header">
          <div>
            <p class="user-settings-section-title">
              成员消耗占比
            </p>
            <p class="user-settings-copy mt-1">
              按当前工作空间累计消耗统计。
            </p>
          </div>
        </div>

        <p v-if="props.aiUsageError" class="user-settings-feedback user-settings-feedback--danger">
          {{ props.aiUsageError }}
        </p>

        <div v-else-if="props.aiUsageMemberSummaries.length > 0" class="user-settings-usage-list">
          <div
            v-for="member in props.aiUsageMemberSummaries"
            :key="member.userId"
            class="user-settings-usage-item"
          >
            <div class="flex gap-3 items-start justify-between">
              <div class="min-w-0">
                <div class="flex gap-3 items-center">
                  <div class="user-settings-member-avatar">
                    {{ props.resolveInitial(member.username) }}
                  </div>
                  <div class="min-w-0">
                    <p class="user-settings-name truncate">
                      {{ member.username }}
                    </p>
                    <p class="user-settings-meta mt-1">
                      {{ member.calls }} 次调用 · 最近消耗：{{ member.lastUsedAt ? props.formatDateTime(member.lastUsedAt) : '暂无记录' }}
                    </p>
                  </div>
                </div>
              </div>
              <div class="text-right">
                <p class="user-settings-name">
                  {{ member.units }} credits
                </p>
                <p class="user-settings-meta mt-1">
                  {{ props.resolveMemberUsagePercent(member) }}
                </p>
              </div>
            </div>
            <div class="user-settings-progress-track">
              <span class="user-settings-progress-fill" :style="props.resolveMemberUsageBarStyle(member)" />
            </div>
          </div>
        </div>

        <div v-else class="user-settings-empty">
          {{ props.aiUsageLoading ? 'AI 消耗统计加载中...' : '当前工作空间暂无 AI 消耗记录。' }}
        </div>
      </section>

      <section class="user-settings-card">
        <div class="user-settings-section-header">
          <div>
            <p class="user-settings-section-title">
              消耗历史
            </p>
            <p class="user-settings-copy mt-1">
              当前共 {{ props.aiUsage?.total || 0 }} 条记录，累计 {{ props.aiUsage?.totalUnits || 0 }} credits。
            </p>
          </div>
        </div>

        <p v-if="props.aiUsageError" class="user-settings-feedback user-settings-feedback--danger">
          {{ props.aiUsageError }}
        </p>

        <div v-else-if="props.aiUsageHistoryItems.length > 0" class="user-settings-record-list">
          <div
            v-for="item in props.aiUsageHistoryItems"
            :key="item.id"
            class="user-settings-record-item"
          >
            <div class="flex-1 min-w-0">
              <div class="flex flex-wrap gap-2 items-center">
                <p class="user-settings-name">
                  {{ props.formatAiRouteLabel(item.route) }}
                </p>
                <span class="user-settings-chip">
                  {{ item.units }} credits
                </span>
              </div>
              <p class="user-settings-meta mt-2">
                {{ item.username }} · {{ props.formatDateTime(item.createdAt) }}
              </p>
              <p class="user-settings-meta user-settings-meta--mono mt-1 break-all">
                {{ item.route }}
              </p>
            </div>
          </div>
        </div>

        <div v-else class="user-settings-empty">
          {{ props.aiUsageLoading ? 'AI 消耗历史加载中...' : '当前工作空间暂无 AI 消耗历史。' }}
        </div>

        <div v-if="props.aiUsageHistoryItems.length > 0" class="user-settings-pagination">
          <button
            class="user-settings-btn user-settings-btn--compact"
            :disabled="props.aiUsageLoading || props.aiUsagePage <= 1"
            @click="emit('changeAiUsagePage', props.aiUsagePage - 1)"
          >
            上一页
          </button>
          <span class="user-settings-meta">
            第 {{ props.aiUsagePage }} / {{ props.aiUsageTotalPages }} 页
          </span>
          <button
            class="user-settings-btn user-settings-btn--compact"
            :disabled="props.aiUsageLoading || props.aiUsagePage >= props.aiUsageTotalPages"
            @click="emit('changeAiUsagePage', props.aiUsagePage + 1)"
          >
            下一页
          </button>
        </div>
      </section>
    </template>

    <div v-else class="user-settings-empty">
      当前账号暂无可见工作空间信息。
    </div>
  </div>
</template>
