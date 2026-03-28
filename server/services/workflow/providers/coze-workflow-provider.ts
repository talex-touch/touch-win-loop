import type { WorkflowProvider, WorkflowRunInput } from '~~/server/services/workflow/workflow-provider'

export const cozeWorkflowProvider: WorkflowProvider = {
  providerName: 'coze_workflow',
  async run(_input: WorkflowRunInput) {
    throw new Error('COZE_WORKFLOW_NOT_IMPLEMENTED')
  },
}
