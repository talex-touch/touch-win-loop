import type { AiRuntimeConfig } from '~~/server/services/ai/llm-client'
import type {
  AiContestFilterRequest,
  AiContestFilterResult,
  Contest,
  ContestFilterInput,
} from '~~/shared/types/domain'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { createChatModel } from '~~/server/services/ai/llm-client'

const filterSchema = z.object({
  normalizedFilters: z.object({
    discipline: z.string().optional().nullable(),
    level: z.enum(['national', 'provincial', 'school', 'industry']).optional().nullable(),
    major: z.string().optional().nullable(),
    trackType: z.string().optional().nullable(),
    keyword: z.array(z.string()).optional(),
  }).default({}),
  reasoning: z.string().default(''),
  contestIds: z.array(z.string()).default([]),
})

interface ContestFilterChainInput {
  request: AiContestFilterRequest
  contests: Contest[]
  ai: AiRuntimeConfig
}

function toContestSummary(contests: Contest[]): string {
  return contests
    .map((contest) => {
      const tracks = contest.tracks.map(track => track.name).join(' / ')
      return `- id=${contest.id}; name=${contest.name}; level=${contest.level}; organizer=${contest.organizer}; tracks=${tracks}; majors=${contest.recommendedFor.join('|')}`
    })
    .join('\n')
}

function normalizeFilters(request: AiContestFilterRequest, parsed: z.infer<typeof filterSchema>): ContestFilterInput {
  return {
    discipline: parsed.normalizedFilters.discipline ?? request.filters?.discipline ?? '',
    level: parsed.normalizedFilters.level ?? request.filters?.level ?? '',
    major: request.major ?? parsed.normalizedFilters.major ?? request.filters?.major ?? '',
    trackType: parsed.normalizedFilters.trackType ?? request.filters?.trackType ?? '',
    keyword: parsed.normalizedFilters.keyword?.length
      ? parsed.normalizedFilters.keyword
      : request.filters?.keyword ?? [],
  }
}

export async function runContestFilterChain(input: ContestFilterChainInput): Promise<AiContestFilterResult> {
  const model = createChatModel(input.ai)
  const structuredModel = model.withStructuredOutput(filterSchema, {
    name: 'ContestFilterResult',
    strict: false,
  })

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', '你是竞赛筛选助手。必须根据候选竞赛列表返回结构化结果，contestIds 只能从给定 id 中选择。'],
    ['human', `用户查询：{query}\n用户专业：{major}\n用户结构化筛选：{filters}\n候选竞赛列表：\n{contestSummary}`],
  ])

  const promptValue = await prompt.invoke({
    query: input.request.query || '请给出推荐',
    major: input.request.major || '未提供',
    filters: JSON.stringify(input.request.filters ?? {}, null, 2),
    contestSummary: toContestSummary(input.contests),
  })

  const parsed = filterSchema.parse(await structuredModel.invoke(promptValue))
  const normalizedFilters = normalizeFilters(input.request, parsed)

  const mapById = new Map(input.contests.map(contest => [contest.id, contest]))
  const selected = parsed.contestIds
    .map(contestId => mapById.get(contestId))
    .filter((contest): contest is Contest => Boolean(contest))

  const contests = selected.length > 0
    ? selected.slice(0, Math.max(1, input.request.topK ?? 6))
    : input.contests.slice(0, Math.max(1, input.request.topK ?? 6))

  return {
    normalizedFilters,
    reasoning: parsed.reasoning || '已结合用户输入和竞赛特征完成排序。',
    contests,
  }
}
