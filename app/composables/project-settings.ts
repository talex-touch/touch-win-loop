import type { Project } from '~~/shared/types/domain'
import type { WorkspaceProjectCommonForm } from '~/types/workspace'

function linesToArray(text: string): string[] {
  return text
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function arrayToLines(list: string[] | undefined): string {
  return (list || []).join('\n')
}

export function createEmptyProjectCommonForm(): WorkspaceProjectCommonForm {
  return {
    title: '',
    summary: '',
    icon: '',
    accentColor: '',
    problemStatement: '',
    innovationPointsText: '',
    techRouteStepsText: '',
    scoringMappingText: '',
    risksText: '',
    deliverablesText: '',
  }
}

export function createProjectCommonFormFromProject(project: Project | null): WorkspaceProjectCommonForm {
  if (!project)
    return createEmptyProjectCommonForm()

  return {
    title: project.title || '',
    summary: project.summary || '',
    icon: project.display?.icon || '',
    accentColor: project.display?.accentColor || '',
    problemStatement: project.problemStatement || '',
    innovationPointsText: arrayToLines(project.innovationPoints),
    techRouteStepsText: arrayToLines(project.techRouteSteps),
    scoringMappingText: arrayToLines(project.scoringMapping),
    risksText: arrayToLines(project.risks),
    deliverablesText: arrayToLines(project.deliverables),
  }
}

export function cloneProjectCommonForm(value: WorkspaceProjectCommonForm): WorkspaceProjectCommonForm {
  return {
    title: value.title,
    summary: value.summary,
    icon: value.icon,
    accentColor: value.accentColor,
    problemStatement: value.problemStatement,
    innovationPointsText: value.innovationPointsText,
    techRouteStepsText: value.techRouteStepsText,
    scoringMappingText: value.scoringMappingText,
    risksText: value.risksText,
    deliverablesText: value.deliverablesText,
  }
}

export function buildProjectSettingsCommonPatch(form: WorkspaceProjectCommonForm) {
  return {
    title: form.title.trim(),
    summary: form.summary.trim(),
    icon: form.icon.trim(),
    accentColor: form.accentColor.trim(),
    problemStatement: form.problemStatement.trim(),
    innovationPoints: linesToArray(form.innovationPointsText),
    techRouteSteps: linesToArray(form.techRouteStepsText),
    scoringMapping: linesToArray(form.scoringMappingText),
    risks: linesToArray(form.risksText),
    deliverables: linesToArray(form.deliverablesText),
  }
}
