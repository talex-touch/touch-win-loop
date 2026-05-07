import type { WorkflowProvider, WorkflowRunInput } from '~~/server/services/workflow/workflow-provider'
import { runFeishuBitableSyncItem } from '~~/server/services/feishu/bitable-sync'

export const feishuBitableWorkflowProvider: WorkflowProvider = {
  providerName: 'feishu_bitable',
  async run(input: WorkflowRunInput) {
    const syncItemId = String(input.syncItemId || '').trim()
    return runFeishuBitableSyncItem(input.event, {
      syncItemId,
      actorUserId: input.actorUserId,
      triggerSource: input.triggerSource === 'webhook' ? 'event' : input.triggerSource,
      mode: input.mode,
      recordIds: input.recordIds,
      force: input.force,
    })
  },
}
