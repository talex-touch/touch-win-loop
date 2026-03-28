<script setup lang="ts">
import type { FeishuDirectoryUserCandidate } from '~~/shared/types/domain'

const props = withDefaults(defineProps<{
  keyword: string
  loading: boolean
  candidates: FeishuDirectoryUserCandidate[]
  notice?: string
  source?: 'tenant' | 'group_fallback' | ''
  fromCache?: boolean
  fetchedAt?: string
  cacheExpiresAt?: string
  totalMembers?: number
  permissionHint?: string
  manualAddingKey?: string
}>(), {
  notice: '',
  source: '',
  fromCache: false,
  fetchedAt: '',
  cacheExpiresAt: '',
  totalMembers: 0,
  permissionHint: '',
  manualAddingKey: '',
})

const emit = defineEmits<{
  (event: 'update:keyword', value: string): void
  (event: 'search', forceRefresh: boolean): void
  (event: 'addUser', userId: string): void
  (event: 'addUnion', unionId: string): void
}>()

const keywordModel = computed({
  get() {
    return props.keyword
  },
  set(value: string) {
    emit('update:keyword', String(value || ''))
  },
})

function formatDateTime(value?: string | null): string {
  const text = String(value || '').trim()
  if (!text)
    return '-'
  return text
}

function sourceLabel(source: 'tenant' | 'group_fallback' | ''): string {
  if (source === 'tenant')
    return '飞书全员目录'
  if (source === 'group_fallback')
    return '管理员组目录'
  return '目录来源未知'
}

function triggerSearch(forceRefresh: boolean) {
  emit('search', forceRefresh)
}

function handleAdd(candidate: FeishuDirectoryUserCandidate) {
  if (candidate.hasContestAdmin)
    return

  if (candidate.userId)
    emit('addUser', candidate.userId)
  else
    emit('addUnion', candidate.unionId)
}
</script>

<template>
  <div class="p-2 border border-slate-200 bg-white space-y-2">
    <div class="flex gap-2 items-center justify-between">
      <p class="text-[10px] text-slate-700 font-semibold m-0">
        飞书成员候选（{{ candidates.length }}）
      </p>
      <div class="flex gap-2 items-center">
        <a-button size="mini" :loading="loading" @click="triggerSearch(false)">
          搜索
        </a-button>
        <a-button size="mini" status="warning" :loading="loading" @click="triggerSearch(true)">
          强制拉取
        </a-button>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 items-center">
      <a-input
        v-model="keywordModel"
        size="small"
        class="max-w-[320px]"
        allow-clear
        placeholder="搜索 union_id / 姓名 / 邮箱 / 手机"
        @keydown.enter.prevent="triggerSearch(false)"
      />
      <p class="text-[10px] text-slate-500 m-0">
        点击“强制拉取”会绕过缓存。
      </p>
    </div>

    <p v-if="loading" class="text-[10px] text-slate-500 m-0">
      检索中...
    </p>

    <div class="flex flex-wrap gap-1 items-center">
      <a-tag v-if="source" color="arcoblue" size="small">
        来源：{{ sourceLabel(source) }}
      </a-tag>
      <a-tag v-if="source" :color="fromCache ? 'gray' : 'green'" size="small">
        {{ fromCache ? '缓存命中' : '实时拉取' }}
      </a-tag>
      <a-tag v-if="totalMembers > 0" color="blue" size="small">
        总成员 {{ totalMembers }}
      </a-tag>
    </div>

    <p v-if="fetchedAt || cacheExpiresAt" class="text-[10px] text-slate-500 m-0">
      数据时间：{{ formatDateTime(fetchedAt) }}；
      缓存到期：{{ formatDateTime(cacheExpiresAt) }}
    </p>

    <p v-if="notice" class="text-[10px] text-amber-700 m-0">
      {{ notice }}
    </p>
    <p v-if="permissionHint" class="text-[10px] text-rose-700 m-0 p-2 border border-rose-200 bg-rose-50">
      权限自检：{{ permissionHint }}
    </p>

    <p v-if="!candidates.length" class="text-[10px] text-slate-500 m-0">
      暂无匹配飞书成员
    </p>
    <div v-else class="max-h-[260px] overflow-auto space-y-1">
      <div
        v-for="candidate in candidates"
        :key="candidate.unionId"
        class="p-2 border border-slate-200 bg-slate-50 flex gap-2 items-start justify-between"
      >
        <div class="min-w-0">
          <p class="text-[10px] text-slate-800 m-0">
            {{ candidate.name || candidate.username || candidate.unionId }}
          </p>
          <p class="text-[10px] text-slate-500 font-mono m-0 break-all">
            union: {{ candidate.unionId }}
          </p>
          <p v-if="candidate.userId" class="text-[10px] text-slate-500 font-mono m-0 break-all">
            user: {{ candidate.userId }}{{ candidate.username ? ` / ${candidate.username}` : '' }}
          </p>
          <div class="mt-1 flex flex-wrap gap-1">
            <a-tag v-if="candidate.hasContestAdmin" color="green" size="small">
              contest_admin
            </a-tag>
            <a-tag v-if="!candidate.userId" color="gray" size="small">
              未建本地账号
            </a-tag>
          </div>
        </div>
        <a-button
          size="mini"
          type="primary"
          :disabled="candidate.hasContestAdmin"
          :loading="candidate.userId ? (manualAddingKey === `user:${candidate.userId}`) : (manualAddingKey === `union:${candidate.unionId}`)"
          @click="handleAdd(candidate)"
        >
          {{ candidate.hasContestAdmin ? '已是管理员' : '手动添加' }}
        </a-button>
      </div>
    </div>
  </div>
</template>
