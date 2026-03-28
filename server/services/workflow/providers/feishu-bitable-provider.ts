import type { WorkflowProvider, WorkflowRunInput } from '~~/server/services/workflow/workflow-provider'
import { runFeishuBitableTask } from '~~/server/services/feishu/bitable-sync'

export const feishuBitableWorkflowProvider: WorkflowProvider = {
  providerName: 'feishu_bitable',
  async run(input: WorkflowRunInput) {
    return runFeishuBitableTask(input.event, {
      taskId: input.taskId,
      actorUserId: input.actorUserId,
      triggerSource: input.triggerSource === 'webhook' ? 'event' : input.triggerSource,
      mode: input.mode,
      recordIds: input.recordIds,
    })
  },
}
