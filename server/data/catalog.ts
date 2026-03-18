import type {
  Contest,
  ContestFilterInput,
  ContestLevel,
  Resource,
  Rubric,
  Track,
} from '~~/shared/types/domain'

const contestData: Contest[] = [
  {
    id: 'challenge-cup',
    name: '挑战杯全国大学生课外学术科技作品竞赛',
    level: 'national',
    organizer: '共青团中央 / 教育部 / 中国科协',
    registrationWindow: '2026-03-01 ~ 2026-04-15',
    submissionDeadline: '2026-05-10',
    recommendedFor: ['计算机', '机械', '电子信息', '经管'],
    keywords: ['创新', '学术科技', '社会价值', '商业计划'],
    tracks: [
      {
        id: 'challenge-cup-tech',
        contestId: 'challenge-cup',
        name: '科技发明制作赛道',
        summary: '强调技术可行性、创新性与可落地性。',
        deliverableTypes: ['方案书', '演示视频', '原型系统'],
        suitableMajors: ['计算机', '自动化', '电子信息'],
      },
      {
        id: 'challenge-cup-paper',
        contestId: 'challenge-cup',
        name: '哲学社会科学调查报告赛道',
        summary: '强调调研方法、数据真实性与社会价值。',
        deliverableTypes: ['调研报告', '答辩 PPT'],
        suitableMajors: ['社会学', '经管', '新闻传播'],
      },
    ],
  },
  {
    id: 'innovation-training',
    name: '大学生创新创业训练计划（国创）',
    level: 'national',
    organizer: '教育部高教司',
    registrationWindow: '2026-02-20 ~ 2026-04-30',
    submissionDeadline: '2026-06-01',
    recommendedFor: ['计算机', '经管', '设计', '医药'],
    keywords: ['创新训练', '创业训练', '项目管理'],
    tracks: [
      {
        id: 'innovation-training-innovation',
        contestId: 'innovation-training',
        name: '创新训练项目',
        summary: '适合技术验证与原型孵化。',
        deliverableTypes: ['开题报告', '中期检查', '结题报告'],
        suitableMajors: ['计算机', '电子信息', '机械'],
      },
      {
        id: 'innovation-training-business',
        contestId: 'innovation-training',
        name: '创业训练项目',
        summary: '强调商业模式与市场验证。',
        deliverableTypes: ['商业计划书', '路演材料'],
        suitableMajors: ['经管', '市场营销', '工商管理'],
      },
    ],
  },
  {
    id: 'service-outsourcing',
    name: '中国大学生服务外包创新创业大赛',
    level: 'national',
    organizer: '商务部 / 教育部',
    registrationWindow: '2026-01-15 ~ 2026-03-31',
    submissionDeadline: '2026-05-20',
    recommendedFor: ['计算机', '软件工程', '人工智能'],
    keywords: ['软件交付', 'AI 应用', '企业场景'],
    tracks: [
      {
        id: 'service-outsourcing-ai',
        contestId: 'service-outsourcing',
        name: 'A 类：企业命题 AI 应用赛道',
        summary: '企业真实命题，强调工程落地。',
        deliverableTypes: ['可运行系统', '技术文档', '答辩材料'],
        suitableMajors: ['计算机', '软件工程', '人工智能'],
      },
      {
        id: 'service-outsourcing-product',
        contestId: 'service-outsourcing',
        name: 'B 类：产品创意与解决方案赛道',
        summary: '强调产品完整性与商业可行性。',
        deliverableTypes: ['产品方案', '原型', '演示视频'],
        suitableMajors: ['产品设计', '信息管理', '经管'],
      },
    ],
  },
  {
    id: 'internet-plus',
    name: '中国国际大学生创新大赛（互联网+）',
    level: 'national',
    organizer: '教育部',
    registrationWindow: '2026-03-10 ~ 2026-06-10',
    submissionDeadline: '2026-06-25',
    recommendedFor: ['全专业', '创新创业团队'],
    keywords: ['创业', '商业计划', '社会价值'],
    tracks: [
      {
        id: 'internet-plus-main',
        contestId: 'internet-plus',
        name: '高教主赛道',
        summary: '强调创新性、商业价值与团队能力。',
        deliverableTypes: ['商业计划书', '路演 PPT', 'Demo'],
        suitableMajors: ['全专业'],
      },
      {
        id: 'internet-plus-industry',
        contestId: 'internet-plus',
        name: '产业命题赛道',
        summary: '基于产业真实场景进行创新。',
        deliverableTypes: ['解决方案', '验证数据', '答辩视频'],
        suitableMajors: ['计算机', '电子', '机械', '经管'],
      },
    ],
  },
  {
    id: 'provincial-data-challenge',
    name: '省级大学生数据智能应用竞赛',
    level: 'provincial',
    organizer: '省教育厅',
    registrationWindow: '2026-04-01 ~ 2026-05-10',
    submissionDeadline: '2026-06-15',
    recommendedFor: ['计算机', '统计学', '数学'],
    keywords: ['数据分析', '机器学习', '可视化'],
    tracks: [
      {
        id: 'provincial-data-model',
        contestId: 'provincial-data-challenge',
        name: '数据建模赛道',
        summary: '强调建模合理性与解释性。',
        deliverableTypes: ['技术报告', '代码仓库', '答辩 PPT'],
        suitableMajors: ['统计学', '数学', '计算机'],
      },
      {
        id: 'provincial-data-visual',
        contestId: 'provincial-data-challenge',
        name: '数据可视化赛道',
        summary: '强调交互表达和洞察转化。',
        deliverableTypes: ['可视化作品', '说明文档'],
        suitableMajors: ['计算机', '设计', '信息管理'],
      },
    ],
  },
]

const rubricData: Rubric[] = contestData.flatMap(contest => contest.tracks.map(track => ({
  id: `${track.id}-rubric`,
  contestId: contest.id,
  trackId: track.id,
  dimensions: [
    { key: 'innovation', name: '创新性', weight: 30, description: '问题定义与方案差异化程度。' },
    { key: 'feasibility', name: '可行性', weight: 25, description: '技术路线清晰，资源可落地。' },
    { key: 'evidence', name: '证据与数据', weight: 20, description: '有可验证的数据支撑。' },
    { key: 'expression', name: '表达规范', weight: 15, description: '结构完整，表达清晰。' },
    { key: 'impact', name: '应用价值', weight: 10, description: '成果转化或社会价值。' },
  ],
})))

const resourceData: Resource[] = [
  {
    id: 'res-1',
    contestId: 'challenge-cup',
    title: '挑战杯 2025 官方通知',
    type: '基本信息',
    year: 2025,
    sourceLink: 'https://www.tiaozhanbei.net',
    availability: 'public',
    summary: '官方参赛通知与赛程说明。',
    copyrightNote: '来源官方站点，平台仅做索引。',
  },
  {
    id: 'res-2',
    contestId: 'challenge-cup',
    title: '挑战杯 往届获奖项目摘要（整理）',
    type: '获奖作品',
    year: 2024,
    sourceLink: 'https://example.com/challenge-cup-awards',
    availability: 'public',
    summary: '覆盖科技发明与社科报告两类。',
    copyrightNote: '仅展示公开摘要与链接。',
  },
  {
    id: 'res-3',
    contestId: 'innovation-training',
    title: '国创申报书模板（高校版）',
    type: '论文/作品模板',
    year: 2025,
    sourceLink: 'https://example.com/innovation-template',
    availability: 'login_required',
    summary: '可作为立项书结构参考。',
    copyrightNote: '需遵循来源平台使用规范。',
  },
  {
    id: 'res-4',
    contestId: 'service-outsourcing',
    title: '服务外包 A 类赛题解读',
    type: '赛道设置',
    year: 2025,
    sourceLink: 'https://example.com/service-outsourcing-track',
    availability: 'public',
    summary: '包含企业命题与评分要点。',
    copyrightNote: '转载需注明原始出处。',
  },
  {
    id: 'res-5',
    contestId: 'internet-plus',
    title: '互联网+ 路演 FAQ',
    type: 'FAQ',
    year: 2025,
    sourceLink: 'https://example.com/internet-plus-faq',
    availability: 'public',
    summary: '答辩流程、提问类型与常见错误。',
    copyrightNote: '来源主办方公开问答。',
  },
  {
    id: 'res-6',
    contestId: 'provincial-data-challenge',
    title: '省赛数据建模优秀论文样例',
    type: '往届真题',
    year: 2024,
    sourceLink: 'https://example.com/provincial-data-samples',
    availability: 'public',
    summary: '展示论文结构与评委关注点。',
    copyrightNote: '仅提供索引链接。',
  },
]

function includesKeyword(source: string, keyword: string): boolean {
  return source.toLowerCase().includes(keyword.toLowerCase())
}

export function listContests(): Contest[] {
  return contestData
}

export function listRubrics(): Rubric[] {
  return rubricData
}

export function listResources(): Resource[] {
  return resourceData
}

export function findContestById(contestId: string): Contest | undefined {
  return contestData.find(contest => contest.id === contestId)
}

export function findTrackById(contestId: string, trackId: string): Track | undefined {
  const contest = findContestById(contestId)
  return contest?.tracks.find(track => track.id === trackId)
}

export function findRubricByTrackId(trackId: string): Rubric | undefined {
  return rubricData.find(rubric => rubric.trackId === trackId)
}

export function filterContests(input: ContestFilterInput & { q?: string }): Contest[] {
  const keywords = (input.keyword ?? []).map(keyword => keyword.trim()).filter(Boolean)

  return contestData.filter((contest) => {
    if (input.level && contest.level !== input.level)
      return false

    if (input.major) {
      const hasMajor = contest.recommendedFor.some(major => includesKeyword(major, input.major!))
        || contest.tracks.some(track => track.suitableMajors.some(major => includesKeyword(major, input.major!)))
      if (!hasMajor)
        return false
    }

    if (input.trackType) {
      const hasTrack = contest.tracks.some(track => includesKeyword(track.name, input.trackType!) || includesKeyword(track.summary, input.trackType!))
      if (!hasTrack)
        return false
    }

    if (input.discipline) {
      const hasDiscipline = contest.keywords.some(keyword => includesKeyword(keyword, input.discipline!))
        || contest.recommendedFor.some(major => includesKeyword(major, input.discipline!))
      if (!hasDiscipline)
        return false
    }

    if (keywords.length > 0) {
      const context = [contest.name, contest.organizer, ...contest.keywords, ...contest.recommendedFor].join(' ')
      const matched = keywords.some(keyword => includesKeyword(context, keyword))
      if (!matched)
        return false
    }

    if (input.q) {
      const fullText = [contest.name, contest.organizer, ...contest.keywords, ...contest.recommendedFor].join(' ')
      if (!includesKeyword(fullText, input.q))
        return false
    }

    return true
  })
}

export function listSupportedLevels(): ContestLevel[] {
  return ['national', 'provincial', 'school', 'industry']
}
