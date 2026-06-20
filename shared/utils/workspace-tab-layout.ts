import type { WorkspaceTabSpacingPreset } from '~~/shared/types/domain'

export interface WorkspaceTabDensityTokens {
  minWidth: string
  paddingX: string
  gap: string
  triggerGap: string
  closePadding: string
  closeButtonSize: string
  activeIndicatorInset: string
  stripHeight: string
  labelSize: string
  iconSize: string
  closeIconSize: string
  breadcrumbPaddingX: string
  breadcrumbPaddingY: string
}

const DEFAULT_WORKSPACE_TAB_DENSITY_TOKENS: WorkspaceTabDensityTokens = {
  minWidth: '156px',
  paddingX: '7px',
  gap: '4px',
  triggerGap: '7px',
  closePadding: '3px',
  closeButtonSize: '24px',
  activeIndicatorInset: '10px',
  stripHeight: '40px',
  labelSize: '12px',
  iconSize: '17px',
  closeIconSize: '14px',
  breadcrumbPaddingX: '12px',
  breadcrumbPaddingY: '6px',
}

const WORKSPACE_TAB_DENSITY_TOKENS_BY_PRESET: Record<WorkspaceTabSpacingPreset, WorkspaceTabDensityTokens> = {
  ultra_compact: {
    minWidth: '96px',
    paddingX: '3px',
    gap: '1px',
    triggerGap: '3px',
    closePadding: '0px',
    closeButtonSize: '18px',
    activeIndicatorInset: '8px',
    stripHeight: '28px',
    labelSize: '9px',
    iconSize: '13px',
    closeIconSize: '10px',
    breadcrumbPaddingX: '11px',
    breadcrumbPaddingY: '3.5px',
  },
  compact: {
    minWidth: '124px',
    paddingX: '5px',
    gap: '2px',
    triggerGap: '5px',
    closePadding: '1px',
    closeButtonSize: '24px',
    activeIndicatorInset: DEFAULT_WORKSPACE_TAB_DENSITY_TOKENS.activeIndicatorInset,
    stripHeight: '36px',
    labelSize: '11px',
    iconSize: '16px',
    closeIconSize: '13px',
    breadcrumbPaddingX: '12px',
    breadcrumbPaddingY: '4px',
  },
  default: DEFAULT_WORKSPACE_TAB_DENSITY_TOKENS,
  relaxed: {
    minWidth: '174px',
    paddingX: '10px',
    gap: '4px',
    triggerGap: '8px',
    closePadding: '4px',
    closeButtonSize: '24px',
    activeIndicatorInset: DEFAULT_WORKSPACE_TAB_DENSITY_TOKENS.activeIndicatorInset,
    stripHeight: '42px',
    labelSize: '12px',
    iconSize: '18px',
    closeIconSize: '14px',
    breadcrumbPaddingX: '12px',
    breadcrumbPaddingY: '6px',
  },
  spacious: {
    minWidth: '190px',
    paddingX: '11px',
    gap: '5px',
    triggerGap: '9px',
    closePadding: '5px',
    closeButtonSize: '24px',
    activeIndicatorInset: DEFAULT_WORKSPACE_TAB_DENSITY_TOKENS.activeIndicatorInset,
    stripHeight: '44px',
    labelSize: '12px',
    iconSize: '19px',
    closeIconSize: '15px',
    breadcrumbPaddingX: '13px',
    breadcrumbPaddingY: '7px',
  },
}

export function resolveWorkspaceTabDensityTokens(
  value: WorkspaceTabSpacingPreset | '' | null | undefined,
): WorkspaceTabDensityTokens {
  return WORKSPACE_TAB_DENSITY_TOKENS_BY_PRESET[value || 'default'] || DEFAULT_WORKSPACE_TAB_DENSITY_TOKENS
}
