import { expect, it } from 'vitest'
import { enrichTopicProposalResult, normalizeTopicBoardInput } from '../../server/services/ai/topic-board-logic.ts'

function createCandidate(id, title, contestFitScore, requiredSkills = []) {
  return {
    id,
    title,
    reason: `${title} 的问题定义与落地方向`,
    innovationPoints: ['创新点 A', '创新点 B'],
    techRouteSteps: ['步骤一', '步骤二', '步骤三'],
    scoringMapping: ['创新性 -> 方案亮点', '可行性 -> 原型验证'],
    risks: ['风险一', '风险二'],
    estimatedWorkload: '中等工作量，建议 4-6 周完成 MVP。',
    recommendedTrackId: 'track-a',
    recommendedTrackName: '产品创新',
    contestFitScore,
    contestFitReasons: ['贴合当前赛道要求', '便于形成原型与答辩证据'],
    similarAwards: [],
    trendSignals: [],
    requiredSkills,
    teamMatchScore: 0,
    teamGapNotes: [],
    evidenceRefs: [],
    decisionStatus: 'candidate',
    compareScores: {
      contestFit: 0,
      noveltySimilarity: 0,
      evidenceReadiness: 0,
      trendHeat: 0,
      teamMatch: 0,
      workloadFeasibility: 0,
    },
    totalScore: 0,
    references: [],
  }
}

it('normalizeTopicBoardInput 会裁剪候选数并清洗标签', () => {
  const result = normalizeTopicBoardInput({
    contestId: 'contest-1',
    trackId: 'track-1',
    keywords: [' AI ', '', '校园', 'AI'],
    teamSkillTags: ['前端', '前端', '建模'],
    candidateCount: 9,
  })

  expect(result.candidateCount).toBe(5)
  expect(result.keywords).toEqual(['AI', '校园'])
  expect(result.teamSkillTags).toEqual(['前端', '建模'])
})

it('enrichTopicProposalResult 会生成排序矩阵与主推候选题', () => {
  const result = enrichTopicProposalResult({
    result: {
      assistantReply: '已生成候选题。',
      proposals: [
        createCandidate('candidate-a', '智慧校园智能问答助手', 86, ['前端', '后端', '提示词工程']),
        createCandidate('candidate-b', '竞赛资料管理平台', 70, ['前端']),
      ],
      compareMatrix: [],
      boardSummary: '',
      teamSkillProfile: [],
      references: [],
      missingFields: [],
    },
    boardInput: {
      contestId: 'contest-1',
      trackId: 'track-1',
      discipline: '人工智能应用',
      topicType: '产品型',
      expectedDifficulty: '中等',
      keywords: ['智慧校园', '问答系统'],
      teamSkillTags: ['前端', '后端', '提示词工程'],
      candidateCount: 3,
      source: 'workspace_dashboard',
    },
    track: {
      id: 'track-1',
      contestId: 'contest-1',
      name: '产品创新',
      summary: '强调工程落地',
      deliverableTypes: ['方案书'],
      suitableMajors: ['计算机'],
    },
    contestResources: [
      {
        id: 'resource-award-1',
        contestId: 'contest-1',
        title: '智慧校园服务获奖方案',
        type: 'pdf',
        year: 2025,
        sourceLink: '',
        availability: 'public',
        summary: '围绕校园服务与问答交互展开，强调多端体验。',
        copyrightNote: '',
        category: 'awarded_works',
      },
    ],
    contestTrends: [
      {
        year: 2025,
        summary: '评审更关注校园真实场景与 AI 助手落地闭环。',
        hotTags: ['智慧校园', 'AI 助手'],
        evidenceSources: ['内部趋势汇总'],
      },
    ],
  })

  expect(result.compareMatrix).toHaveLength(2)
  expect(result.selectedCandidateId).toBe('candidate-a')
  expect(result.teamSkillProfile).toEqual(['前端', '后端', '提示词工程'])
  expect(result.proposals[0].decisionStatus).toBe('selected')
  expect(result.proposals[0].totalScore).toBeGreaterThanOrEqual(result.proposals[1].totalScore)
})
