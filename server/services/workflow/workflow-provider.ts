import type { H3Event } from 'h3'

export type WorkflowTriggerSource = 'manual' | 'scheduled' | 'webhook'

export interface WorkflowRunInput {
  event?: H3Event
  taskId: string
  actorUserId: string
  triggerSource: WorkflowTriggerSource
}

export interface WorkflowProvider {
  readonly providerName: string
  run(input: WorkflowRunInput): Promise<unknown>
}
