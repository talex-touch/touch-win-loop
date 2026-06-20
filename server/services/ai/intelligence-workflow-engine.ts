import type { H3Event } from 'h3'
import type { Queryable } from '~~/server/utils/db'
import type { RuntimeSettings } from '~~/server/utils/env'
import type {
  AiProjectChangeRequest,
  AiWorkflowContextSource,
  AiWorkflowDefinition,
  AiWorkflowRun,
  AiWorkflowRunStep,
  AuthUser,
  ChatMessage,
  Project,
} from '~~/shared/types/domain'
import { executeWorkflowTool, listWorkflowTools } from '~~/server/services/ai/intelligence-tool-registry'
import { buildIntelligenceWorkflowContextBundle, buildWorkflowContextSnapshot } from '~~/server/services/ai/intelligence-workflow-context'
import { executeWorkspaceAi } from '~~/server/services/ai/workspace-orchestrator'
import { createAiChatSession } from '~~/server/utils/chat-store'
import { getAiProjectChangeRequestById } from '~~/server/utils/project-ai-store'
import {
  createAiWorkflowRun,
  getAiWorkflowDefinitionById,
  getAiWorkflowRunById,
  listAiWorkflowRunsByProject,
  patchAiWorkflowRun,
  saveAiWorkflowRunStep,
} from '~~/server/utils/project-intelligence-workflow-store'

interface ExecuteIntelligenceWorkflowInput {
  event?: H3Event
  db: Queryable
  runtime: RuntimeSettings
  user: AuthUser
  project: Project
  workflow: AiWorkflowDefinition
  triggerPayload?: Record<string, unknown>
}

interface ContinueIntelligenceWorkflowInput {
  event?: H3Event
  db: Queryable
  runtime: RuntimeSettings
  user: AuthUser
  project: Project
  runId: string
}

interface WorkflowRuntimeArtifact {
  stepId: string
  stepIndex: number
  name: string
  type: string
  summary: string
}

interface WorkflowRuntimeState extends Record<string, unknown> {
  workflowSessionId?: string
  promptStack: string[]
  artifacts: WorkflowRuntimeArtifact[]
}

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function resolveProjectWorkspaceId(project: Project): string {
  const workspaceId = normalizeString(project.workspaceId || project.teamId)
  if (!workspaceId)
    throw new Error('PROJECT_WORKSPACE_REQUIRED')
  return workspaceId
}

function normalizeWorkflowRuntimeState(value: unknown): WorkflowRuntimeState {
  const source = normalizeRecord(value)
  const promptStack = Array.isArray(source.promptStack)
    ? source.promptStack.map(item => normalizeString(item)).filter(Boolean).slice(-12)
    : []
  const artifacts = Array.isArray(source.artifacts)
    ? source.artifacts
        .map((item) => {
          const artifact = normalizeRecord(item)
          return {
            stepId: normalizeString(artifact.stepId),
            stepIndex: Number.isFinite(Number(artifact.stepIndex)) ? Number(artifact.stepIndex) : 0,
            name: normalizeString(artifact.name),
            type: normalizeString(artifact.type),
            summary: normalizeString(artifact.summary).slice(0, 1200),
          }
        })
        .filter(item => item.stepId && item.summary)
        .slice(-24)
    : []

  return {
    workflowSessionId: normalizeString(source.workflowSessionId) || undefined,
    promptStack,
    artifacts,
  }
}

function summarizeOutput(output: Record<string, unknown>): string {
  const assistantReply = normalizeString(output.assistantReply)
  if (assistantReply)
    return assistantReply.slice(0, 1200)

  const text = normalizeString(output.text)
  if (text)
    return text.slice(0, 1200)

  const summary = normalizeString(output.summary)
  if (summary)
    return summary.slice(0, 1200)

  try {
    return JSON.stringify(output).slice(0, 1200)
  }
  catch {
    return ''
  }
}

function appendPromptState(state: WorkflowRuntimeState, prompt: string): WorkflowRuntimeState {
  const normalized = normalizeString(prompt)
  if (!normalized)
    return state
  return {
    ...state,
    promptStack: [...state.promptStack, normalized].slice(-12),
  }
}

function appendArtifactState(
  state: WorkflowRuntimeState,
  input: {
    stepId: string
    stepIndex: number
    name: string
    type: string
    output: Record<string, unknown>
  },
): WorkflowRuntimeState {
  const summary = summarizeOutput(input.output)
  if (!summary)
    return state
  return {
    ...state,
    artifacts: [
      ...state.artifacts,
      {
        stepId: input.stepId,
        stepIndex: input.stepIndex,
        name: input.name,
        type: input.type,
        summary,
      },
    ].slice(-24),
  }
}

function resolveStepContextSources(
  run: AiWorkflowRun,
  step: AiWorkflowDefinition['steps'][number],
): AiWorkflowContextSource[] {
  const fromStep = Array.isArray(step.contextSources) ? step.contextSources : []
  return fromStep.length > 0 ? fromStep : run.definitionSnapshot.contextSources
}

function buildAgentMessages(input: {
  run: AiWorkflowRun
  step: AiWorkflowDefinition['steps'][number]
  contextSnapshot: string
  runtimeState: WorkflowRuntimeState
}): ChatMessage[] {
  const sections = [
    input.contextSnapshot ? `[工作流上下文]\n${input.contextSnapshot}` : '',
    input.runtimeState.promptStack.length > 0
      ? `[既有工作流提示]\n${input.runtimeState.promptStack.map((item, index) => `${index + 1}. ${item}`).join('\n')}`
      : '',
    input.runtimeState.artifacts.length > 0
      ? `[上游步骤产出]\n${input.runtimeState.artifacts.map(item => `- ${item.name}：${item.summary}`).join('\n')}`
      : '',
    `[当前步骤]\n${normalizeString(input.step.prompt)}`,
  ].filter(Boolean)

  return [{
    role: 'user',
    content: sections.join('\n\n'),
  }]
}

async function ensureWorkflowSessionId(
  db: Queryable,
  input: {
    runtimeState: WorkflowRuntimeState
    run: AiWorkflowRun
    project: Project
    user: AuthUser
  },
): Promise<WorkflowRuntimeState> {
  if (normalizeString(input.runtimeState.workflowSessionId))
    return input.runtimeState

  const session = await createAiChatSession(db, {
    workspaceId: resolveProjectWorkspaceId(input.project),
    projectId: input.project.id,
    mode: 'dialog_ask',
    createdByUserId: input.user.id,
    title: `智能工作流 · ${input.run.definitionSnapshot.name}`,
    contestId: input.project.contestId,
    trackId: input.project.trackId,
  })

  return {
    ...input.runtimeState,
    workflowSessionId: session.id,
  }
}

async function fetchChangeRequests(
  db: Queryable,
  projectId: string,
  changeRequestIds: string[],
): Promise<AiProjectChangeRequest[]> {
  const items: AiProjectChangeRequest[] = []
  for (const changeId of changeRequestIds) {
    const item = await getAiProjectChangeRequestById(db, {
      projectId,
      changeId,
    })
    if (item)
      items.push(item)
  }
  return items
}

async function hydrateRunReviewContexts(
  db: Queryable,
  run: AiWorkflowRun | null,
): Promise<AiWorkflowRun | null> {
  if (!run?.steps?.length)
    return run

  const nextSteps: AiWorkflowRunStep[] = []
  for (const step of run.steps) {
    if (step.reviewContext?.kind === 'project_change_request' && step.reviewContext.changeRequestIds.length > 0) {
      nextSteps.push({
        ...step,
        reviewContext: {
          ...step.reviewContext,
          changeRequests: await fetchChangeRequests(db, run.projectId, step.reviewContext.changeRequestIds),
        },
      })
      continue
    }
    nextSteps.push(step)
  }

  return {
    ...run,
    steps: nextSteps,
  }
}

async function finalizeRun(
  db: Queryable,
  projectId: string,
  runId: string,
): Promise<AiWorkflowRun> {
  const run = await getAiWorkflowRunById(db, {
    projectId,
    runId,
    includeSteps: true,
  })
  if (!run)
    throw new Error('WORKFLOW_RUN_NOT_FOUND')
  return await hydrateRunReviewContexts(db, run) as AiWorkflowRun
}

async function runWorkflowSteps(
  input: ExecuteIntelligenceWorkflowInput & {
    run: AiWorkflowRun
    runtimeState: WorkflowRuntimeState
    startIndex: number
  },
): Promise<AiWorkflowRun> {
  let runtimeState = input.runtimeState
  let currentRun = input.run
  const projectWorkspaceId = resolveProjectWorkspaceId(input.project)

  for (let index = input.startIndex; index < currentRun.definitionSnapshot.steps.length; index += 1) {
    const step = currentRun.definitionSnapshot.steps[index]!
    const contextSources = resolveStepContextSources(currentRun, step)
    const contextBundle = await buildIntelligenceWorkflowContextBundle(input.db, {
      event: input.event,
      workspaceId: projectWorkspaceId,
      projectId: input.project.id,
      user: input.user,
      selectedResourceIds: Array.isArray(currentRun.triggerPayload?.selectedResourceIds)
        ? currentRun.triggerPayload?.selectedResourceIds as string[]
        : [],
      sessionId: normalizeString(currentRun.triggerPayload?.sessionId),
      query: normalizeString(step.prompt) || normalizeString(currentRun.triggerPayload?.note) || currentRun.definitionSnapshot.name,
      contestName: input.project.contestId,
      trackName: input.project.trackId,
    })
    const contextSnapshot = buildWorkflowContextSnapshot(contextBundle, contextSources)

    runtimeState = await ensureWorkflowSessionId(input.db, {
      runtimeState,
      run: currentRun,
      project: input.project,
      user: input.user,
    })
    currentRun = await patchAiWorkflowRun(input.db, {
      projectId: input.project.id,
      runId: currentRun.id,
      status: 'running',
      latestStepIndex: index,
      runtimeState,
      startedAt: currentRun.startedAt || new Date().toISOString(),
    }) as AiWorkflowRun

    await saveAiWorkflowRunStep(input.db, {
      runId: currentRun.id,
      workflowId: currentRun.workflowId,
      stepId: step.id,
      stepIndex: index,
      name: step.name,
      type: step.type,
      status: 'running',
      toolKey: step.toolKey,
      agentMode: step.agentMode,
      continueOnError: Boolean(step.continueOnError),
      input: {
        contextSources,
        contextPreview: contextSnapshot.slice(0, 2000),
        prompt: normalizeString(step.prompt),
        toolInput: step.toolInput || {},
      },
      startedAt: new Date().toISOString(),
    })

    try {
      if (step.type === 'prompt') {
        runtimeState = appendPromptState(runtimeState, step.prompt || '')
        await saveAiWorkflowRunStep(input.db, {
          runId: currentRun.id,
          workflowId: currentRun.workflowId,
          stepId: step.id,
          stepIndex: index,
          name: step.name,
          type: step.type,
          status: 'completed',
          continueOnError: Boolean(step.continueOnError),
          input: {
            contextSources,
            prompt: normalizeString(step.prompt),
          },
          output: {
            addedPrompt: normalizeString(step.prompt),
            promptStackSize: runtimeState.promptStack.length,
          },
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        })
      }
      else if (step.type === 'tool') {
        const toolCatalog = new Set(currentRun.definitionSnapshot.toolAllowlist)
        if (!step.toolKey || !toolCatalog.has(step.toolKey))
          throw new Error('WORKFLOW_TOOL_NOT_ALLOWLISTED')

        const toolResult = await executeWorkflowTool(step.toolKey, step.toolInput || {}, {
          event: input.event,
          db: input.db,
          runtime: input.runtime,
          user: input.user,
          project: input.project,
          workflowId: currentRun.workflowId,
          runId: currentRun.id,
          sessionId: runtimeState.workflowSessionId || '',
          contextSnapshot,
        })

        if (toolResult.reviewContext?.kind === 'project_change_request') {
          await saveAiWorkflowRunStep(input.db, {
            runId: currentRun.id,
            workflowId: currentRun.workflowId,
            stepId: step.id,
            stepIndex: index,
            name: step.name,
            type: step.type,
            status: 'needs_review',
            toolKey: step.toolKey,
            continueOnError: Boolean(step.continueOnError),
            input: {
              contextSources,
              prompt: normalizeString(step.prompt),
              toolInput: step.toolInput || {},
            },
            output: toolResult.output,
            reviewContext: toolResult.reviewContext,
            startedAt: new Date().toISOString(),
          })
          await patchAiWorkflowRun(input.db, {
            projectId: input.project.id,
            runId: currentRun.id,
            status: 'needs_review',
            latestStepIndex: index,
            runtimeState,
          })
          return await finalizeRun(input.db, input.project.id, currentRun.id)
        }

        runtimeState = appendArtifactState(runtimeState, {
          stepId: step.id,
          stepIndex: index,
          name: step.name,
          type: step.type,
          output: toolResult.output,
        })
        await saveAiWorkflowRunStep(input.db, {
          runId: currentRun.id,
          workflowId: currentRun.workflowId,
          stepId: step.id,
          stepIndex: index,
          name: step.name,
          type: step.type,
          status: 'completed',
          toolKey: step.toolKey,
          continueOnError: Boolean(step.continueOnError),
          input: {
            contextSources,
            prompt: normalizeString(step.prompt),
            toolInput: step.toolInput || {},
          },
          output: toolResult.output,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        })
      }
      else {
        const toolEvents: Array<{ name: string, payload: Record<string, unknown> }> = []
        const execution = await executeWorkspaceAi({
          sessionId: runtimeState.workflowSessionId || '',
          runtime: input.runtime,
          ai: input.runtime.ai,
          mode: step.agentMode || 'dialog_ask',
          messages: buildAgentMessages({
            run: currentRun,
            step,
            contextSnapshot,
            runtimeState,
          }),
          context: {
            workspaceId: projectWorkspaceId,
            projectId: input.project.id,
            projectTitle: input.project.title,
            contestId: input.project.contestId,
            trackId: input.project.trackId,
            major: '',
            contestName: input.project.contestId,
            trackName: input.project.trackId,
            resourceId: '',
            resourceTitle: '',
            markdown: '',
            selectionText: '',
            selectionRange: null,
            trigger: 'workflow_run',
            documentAction: '',
            assistantPreset: 'default',
            assistantLabel: currentRun.definitionSnapshot.name,
            contextualAssistantKey: '',
            interactionIntent: 'context_chat',
            actionSource: 'composer',
            requestedAgentAction: '',
            activeTabId: 'loopy_data',
            previewMode: '',
            resourcePurpose: '',
            workflowSnapshot: null,
            workflowAction: '',
            workflowTemplate: '',
            workflowArchitectureView: '',
            workflowStylePreset: '',
            workflowLayoutPreset: '',
            sceneHash: '',
            sceneSourceText: '',
            sceneSourceFormat: '',
            sceneAction: '',
            sceneTemplate: '',
            sceneArchitectureView: '',
            sceneStylePreset: '',
            sceneLayoutPreset: '',
            projectSettingsSummary: contextBundle.sources['project.settings'],
            projectOutlineSummary: contextBundle.sources['project.outline'],
            resourceSummary: buildWorkflowContextSnapshot(contextBundle, contextSources),
            latestUserMessage: normalizeString(step.prompt),
          },
          hooks: {
            onTool: (name, payload) => {
              toolEvents.push({
                name,
                payload,
              })
            },
          },
        })

        const output: Record<string, unknown> = {
          mode: step.agentMode || 'dialog_ask',
          assistantReply: execution.data.assistantReply,
          fallbackUsed: execution.fallbackUsed,
          attempts: execution.attempts,
          checkpointRef: execution.checkpointRef || '',
          toolEvents,
          changeDrafts: execution.data.changeDrafts,
          issueDrafts: execution.data.issueDrafts,
          documentDraft: execution.data.documentDraft,
          workflowDraft: execution.data.workflowDraft,
          sceneDraft: execution.data.sceneDraft,
        }

        if (Array.isArray(execution.data.changeDrafts) && execution.data.changeDrafts.length > 0) {
          const toolLikeResult = await executeWorkflowTool('project.propose_change', {
            changes: execution.data.changeDrafts,
          }, {
            event: input.event,
            db: input.db,
            runtime: input.runtime,
            user: input.user,
            project: input.project,
            workflowId: currentRun.workflowId,
            runId: currentRun.id,
            sessionId: runtimeState.workflowSessionId || '',
            contextSnapshot,
          })

          output.changeRequests = toolLikeResult.output.items || []

          await saveAiWorkflowRunStep(input.db, {
            runId: currentRun.id,
            workflowId: currentRun.workflowId,
            stepId: step.id,
            stepIndex: index,
            name: step.name,
            type: step.type,
            status: 'needs_review',
            agentMode: step.agentMode,
            continueOnError: Boolean(step.continueOnError),
            input: {
              contextSources,
              prompt: normalizeString(step.prompt),
            },
            output,
            reviewContext: toolLikeResult.reviewContext,
            startedAt: new Date().toISOString(),
          })
          await patchAiWorkflowRun(input.db, {
            projectId: input.project.id,
            runId: currentRun.id,
            status: 'needs_review',
            latestStepIndex: index,
            runtimeState,
          })
          return await finalizeRun(input.db, input.project.id, currentRun.id)
        }

        runtimeState = appendArtifactState(runtimeState, {
          stepId: step.id,
          stepIndex: index,
          name: step.name,
          type: step.type,
          output,
        })
        await saveAiWorkflowRunStep(input.db, {
          runId: currentRun.id,
          workflowId: currentRun.workflowId,
          stepId: step.id,
          stepIndex: index,
          name: step.name,
          type: step.type,
          status: 'completed',
          agentMode: step.agentMode,
          continueOnError: Boolean(step.continueOnError),
          input: {
            contextSources,
            prompt: normalizeString(step.prompt),
          },
          output,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        })
      }

      currentRun = await patchAiWorkflowRun(input.db, {
        projectId: input.project.id,
        runId: currentRun.id,
        status: 'running',
        latestStepIndex: index,
        runtimeState,
      }) as AiWorkflowRun
    }
    catch (error) {
      const errorMessage = error instanceof Error ? (error.message || 'WORKFLOW_STEP_FAILED') : 'WORKFLOW_STEP_FAILED'
      await saveAiWorkflowRunStep(input.db, {
        runId: currentRun.id,
        workflowId: currentRun.workflowId,
        stepId: step.id,
        stepIndex: index,
        name: step.name,
        type: step.type,
        status: 'failed',
        toolKey: step.toolKey,
        agentMode: step.agentMode,
        continueOnError: Boolean(step.continueOnError),
        input: {
          contextSources,
          prompt: normalizeString(step.prompt),
          toolInput: step.toolInput || {},
        },
        errorMessage,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      })

      if (!step.continueOnError) {
        await patchAiWorkflowRun(input.db, {
          projectId: input.project.id,
          runId: currentRun.id,
          status: 'failed',
          latestStepIndex: index,
          runtimeState,
          errorMessage,
          completedAt: new Date().toISOString(),
        })
        return await finalizeRun(input.db, input.project.id, currentRun.id)
      }

      currentRun = await patchAiWorkflowRun(input.db, {
        projectId: input.project.id,
        runId: currentRun.id,
        status: 'running',
        latestStepIndex: index,
        runtimeState,
        errorMessage: '',
      }) as AiWorkflowRun
    }
  }

  await patchAiWorkflowRun(input.db, {
    projectId: input.project.id,
    runId: currentRun.id,
    status: 'completed',
    runtimeState,
    completedAt: new Date().toISOString(),
  })
  return await finalizeRun(input.db, input.project.id, currentRun.id)
}

export async function executeIntelligenceWorkflow(input: ExecuteIntelligenceWorkflowInput): Promise<AiWorkflowRun> {
  const createdRun = await createAiWorkflowRun(input.db, {
    workflowId: input.workflow.id,
    workspaceId: resolveProjectWorkspaceId(input.project),
    projectId: input.project.id,
    status: 'running',
    trigger: input.workflow.trigger,
    triggerPayload: input.triggerPayload || {},
    definitionSnapshot: input.workflow,
    runtimeState: {
      promptStack: [],
      artifacts: [],
    },
    latestStepIndex: -1,
    createdByUserId: input.user.id,
    startedAt: new Date().toISOString(),
  })

  return await runWorkflowSteps({
    ...input,
    run: createdRun,
    runtimeState: normalizeWorkflowRuntimeState(createdRun.runtimeState),
    startIndex: 0,
  })
}

export async function continueIntelligenceWorkflow(input: ContinueIntelligenceWorkflowInput): Promise<AiWorkflowRun> {
  const run = await getAiWorkflowRunById(input.db, {
    projectId: input.project.id,
    runId: input.runId,
    includeSteps: true,
  })
  if (!run)
    throw new Error('WORKFLOW_RUN_NOT_FOUND')
  if (run.status !== 'needs_review')
    throw new Error('WORKFLOW_RUN_NOT_WAITING_REVIEW')

  const workflow = await getAiWorkflowDefinitionById(input.db, {
    projectId: input.project.id,
    workflowId: run.workflowId,
    includeArchived: true,
  })
  if (!workflow)
    throw new Error('WORKFLOW_DEFINITION_NOT_FOUND')

  const blockingStep = (run.steps || []).find(step => step.status === 'needs_review') || null
  if (!blockingStep)
    throw new Error('WORKFLOW_REVIEW_STEP_NOT_FOUND')

  const reviewContext = blockingStep.reviewContext
  if (!reviewContext || reviewContext.kind !== 'project_change_request' || reviewContext.changeRequestIds.length === 0)
    throw new Error('WORKFLOW_REVIEW_CONTEXT_INVALID')

  const changeRequests = await fetchChangeRequests(input.db, input.project.id, reviewContext.changeRequestIds)
  if (changeRequests.some(item => item.status === 'pending'))
    throw new Error('WORKFLOW_REVIEW_PENDING')
  if (changeRequests.some(item => item.status === 'rejected' || item.status === 'failed')) {
    await saveAiWorkflowRunStep(input.db, {
      runId: run.id,
      workflowId: run.workflowId,
      stepId: blockingStep.stepId,
      stepIndex: blockingStep.stepIndex,
      name: blockingStep.name,
      type: blockingStep.type,
      status: 'failed',
      toolKey: blockingStep.toolKey,
      agentMode: blockingStep.agentMode,
      continueOnError: blockingStep.continueOnError,
      input: blockingStep.input || {},
      output: {
        ...(blockingStep.output || {}),
        reviewStatus: 'rejected',
        changeRequests,
      },
      reviewContext: {
        ...reviewContext,
        changeRequests,
      },
      errorMessage: 'WORKFLOW_REVIEW_REJECTED',
      startedAt: blockingStep.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
    })
    await patchAiWorkflowRun(input.db, {
      projectId: input.project.id,
      runId: run.id,
      status: 'failed',
      latestStepIndex: blockingStep.stepIndex,
      runtimeState: run.runtimeState || {},
      errorMessage: 'WORKFLOW_REVIEW_REJECTED',
      completedAt: new Date().toISOString(),
    })
    return await finalizeRun(input.db, input.project.id, run.id)
  }

  let runtimeState = normalizeWorkflowRuntimeState(run.runtimeState)
  runtimeState = appendArtifactState(runtimeState, {
    stepId: blockingStep.stepId,
    stepIndex: blockingStep.stepIndex,
    name: blockingStep.name,
    type: blockingStep.type,
    output: {
      summary: `关联审批已全部通过，共 ${changeRequests.length} 条。`,
    },
  })

  await saveAiWorkflowRunStep(input.db, {
    runId: run.id,
    workflowId: run.workflowId,
    stepId: blockingStep.stepId,
    stepIndex: blockingStep.stepIndex,
    name: blockingStep.name,
    type: blockingStep.type,
    status: 'completed',
    toolKey: blockingStep.toolKey,
    agentMode: blockingStep.agentMode,
    continueOnError: blockingStep.continueOnError,
    input: blockingStep.input || {},
    output: {
      ...(blockingStep.output || {}),
      reviewStatus: 'approved',
      changeRequests,
    },
    reviewContext: {
      ...reviewContext,
      changeRequests,
    },
    startedAt: blockingStep.startedAt || new Date().toISOString(),
    completedAt: new Date().toISOString(),
  })

  const resumedRun = await patchAiWorkflowRun(input.db, {
    projectId: input.project.id,
    runId: run.id,
    status: 'running',
    latestStepIndex: blockingStep.stepIndex,
    runtimeState,
    errorMessage: '',
  })
  if (!resumedRun)
    throw new Error('WORKFLOW_RUN_NOT_FOUND')

  return await runWorkflowSteps({
    ...input,
    workflow,
    triggerPayload: resumedRun.triggerPayload || {},
    run: resumedRun,
    runtimeState,
    startIndex: blockingStep.stepIndex + 1,
  })
}

export async function getIntelligenceWorkflowRunDetail(
  db: Queryable,
  input: {
    projectId: string
    runId: string
  },
): Promise<AiWorkflowRun | null> {
  const run = await getAiWorkflowRunById(db, {
    projectId: input.projectId,
    runId: input.runId,
    includeSteps: true,
  })
  return await hydrateRunReviewContexts(db, run)
}

export async function listIntelligenceWorkflowRuns(
  db: Queryable,
  input: {
    projectId: string
    workflowId?: string
    limit?: number
  },
): Promise<AiWorkflowRun[]> {
  const runs = await listAiWorkflowRunsByProject(db, {
    projectId: input.projectId,
    workflowId: input.workflowId,
    limit: input.limit,
    includeSteps: true,
  })

  const hydrated: AiWorkflowRun[] = []
  for (const run of runs)
    hydrated.push(await hydrateRunReviewContexts(db, run) as AiWorkflowRun)
  return hydrated
}

export function listIntelligenceWorkflowToolCatalog() {
  return listWorkflowTools()
}
