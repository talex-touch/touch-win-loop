import type { WorkflowProvider, WorkflowRunInput } from '~~/server/services/workflow/workflow-provider'
import { cozeWorkflowProvider } from '~~/server/services/workflow/providers/coze-workflow-provider'
import { feishuBitableWorkflowProvider } from '~~/server/services/workflow/providers/feishu-bitable-provider'

const providerRegistry = new Map<string, WorkflowProvider>([
  [feishuBitableWorkflowProvider.providerName, feishuBitableWorkflowProvider],
  [cozeWorkflowProvider.providerName, cozeWorkflowProvider],
])

export function registerWorkflowProvider(provider: WorkflowProvider): void {
  providerRegistry.set(String(provider.providerName || '').trim(), provider)
}

export function getWorkflowProvider(providerName: string): WorkflowProvider | null {
  return providerRegistry.get(String(providerName || '').trim()) || null
}

export async function runWorkflow(input: WorkflowRunInput & { providerName: string }): Promise<unknown> {
  const provider = getWorkflowProvider(input.providerName)
  if (!provider)
    throw new Error(`WORKFLOW_PROVIDER_NOT_FOUND:${input.providerName}`)
  return provider.run(input)
}
