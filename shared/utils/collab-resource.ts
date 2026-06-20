import type { CollabPurpose, ResourceKind } from '~~/shared/types/domain'

type CollabResourceKind = Extract<ResourceKind, 'markdown' | 'draw'>

export const COLLAB_NOTES_RESOURCE_LABEL = '妙想文档'
export const COLLAB_FREEFORM_RESOURCE_LABEL = '原型白板'
export const COLLAB_DESIGN_RESOURCE_LABEL = '设计画布'
export const COLLAB_WORKFLOW_RESOURCE_LABEL = '流程画布'
export const COLLAB_GENERIC_RESOURCE_LABEL = '协作内容'

export function resolveCollabResourceDisplayLabel(
  purpose: CollabPurpose | '' | null | undefined,
  kind: CollabResourceKind | '' | null | undefined = '',
): string {
  if (purpose === 'workflow')
    return COLLAB_WORKFLOW_RESOURCE_LABEL
  if (purpose === 'design')
    return COLLAB_DESIGN_RESOURCE_LABEL
  if (purpose === 'freeform')
    return COLLAB_FREEFORM_RESOURCE_LABEL
  if (purpose === 'notes')
    return COLLAB_NOTES_RESOURCE_LABEL
  if (kind === 'draw')
    return COLLAB_FREEFORM_RESOURCE_LABEL
  if (kind === 'markdown')
    return COLLAB_NOTES_RESOURCE_LABEL
  return COLLAB_GENERIC_RESOURCE_LABEL
}
