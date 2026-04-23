import type { H3Event } from 'h3'
import type { RuntimeSettings } from '~~/server/utils/env'
import type { DocumentAnalysis, ProjectResourceReviewJob } from '~~/shared/types/domain'
import { analyzePdfBufferWithDocAi } from '~~/server/services/document/analysis'
import { reviewDocumentPages } from '~~/server/services/document/page-review'
import { getDocumentStorage } from '~~/server/storage/document-storage'
import { withClient, withTransaction } from '~~/server/utils/db'
import {
  getProjectResourceDocumentAnalysisByResourceId,
  getProjectResourcePreviewFileRef,
  updateProjectResourceDocumentAnalysis,
} from '~~/server/utils/project-resource-document-store'
import {
  createProjectResourceReviewJob,
  getProjectResourceReviewJob,
  replaceProjectResourceReviewFindings,
  updateProjectResourceReviewJobState,
} from '~~/server/utils/project-resource-review-store'

function normalizeString(value: unknown): string {
  return String(value || '').trim()
}

function hasAnalysisText(analysis: DocumentAnalysis | null): boolean {
  return Boolean(analysis?.pages?.some(page => page.blocks?.some(block => normalizeString(block.text))))
}

async function resolveResourceTitle(event: H3Event, projectId: string, resourceId: string): Promise<string> {
  return withClient(event, async (db) => {
    const result = await db.query<{ title: string }>(
      `SELECT title
       FROM project_resources
       WHERE project_id = $1
         AND id = $2
       LIMIT 1`,
      [projectId, resourceId],
    )
    return normalizeString(result.rows[0]?.title) || '项目资料'
  })
}

async function resolveReviewAnalysis(input: {
  event: H3Event
  projectId: string
  resourceId: string
  actorUserId: string
  runtime: RuntimeSettings
}): Promise<{
  documentId: string
  analysis: DocumentAnalysis
  pageCount: number
}> {
  const current = await withClient(input.event, async (db) => {
    return getProjectResourceDocumentAnalysisByResourceId(db, {
      projectId: input.projectId,
      resourceId: input.resourceId,
    })
  })
  if (!current)
    throw new Error('DOCUMENT_NOT_FOUND')

  if (hasAnalysisText(current.analysis)) {
    return {
      documentId: current.document.id,
      analysis: current.analysis!,
      pageCount: Math.max(current.document.pageCount, current.analysis!.pages.length),
    }
  }

  const previewRef = await withClient(input.event, async (db) => {
    return getProjectResourcePreviewFileRef(db, {
      projectId: input.projectId,
      resourceId: input.resourceId,
    })
  })
  if (!previewRef || !normalizeString(previewRef.mimeType).toLowerCase().includes('pdf'))
    throw new Error('PREVIEW_NOT_READY')

  const buffer = await getDocumentStorage().getObjectBuffer(previewRef.objectKey)
  const parsed = await analyzePdfBufferWithDocAi(buffer, {
    fileName: previewRef.fileName,
    runtime: input.runtime,
  })

  await withTransaction(input.event, async (db) => {
    await updateProjectResourceDocumentAnalysis(db, {
      documentId: current.document.id,
      analysis: parsed.analysis,
      pageCount: parsed.pageCount,
      actorUserId: input.actorUserId,
    })
  })

  return {
    documentId: current.document.id,
    analysis: parsed.analysis,
    pageCount: parsed.pageCount,
  }
}

export async function runProjectResourcePageReview(input: {
  event: H3Event
  projectId: string
  resourceId: string
  actorUserId: string
  prompt?: string
  runtime: RuntimeSettings
}): Promise<ProjectResourceReviewJob> {
  const [resourceTitle, resolved] = await Promise.all([
    resolveResourceTitle(input.event, input.projectId, input.resourceId),
    resolveReviewAnalysis(input),
  ])

  const job = await withTransaction(input.event, async (db) => {
    return createProjectResourceReviewJob(db, {
      projectId: input.projectId,
      resourceId: input.resourceId,
      documentId: resolved.documentId,
      prompt: input.prompt,
      pageTotal: Math.max(resolved.pageCount, resolved.analysis.pages.length),
      actorUserId: input.actorUserId,
    })
  })

  await withTransaction(input.event, async (db) => {
    await updateProjectResourceReviewJobState(db, {
      jobId: job.id,
      status: 'processing',
      pageReviewed: 0,
    })
  })

  try {
    const review = await reviewDocumentPages({
      analysis: resolved.analysis,
      resourceTitle,
      prompt: input.prompt,
      runtime: input.runtime,
    })

    await withTransaction(input.event, async (db) => {
      await replaceProjectResourceReviewFindings(db, {
        jobId: job.id,
        projectId: input.projectId,
        resourceId: input.resourceId,
        documentId: resolved.documentId,
        findings: review.findings,
      })
      await updateProjectResourceReviewJobState(db, {
        jobId: job.id,
        status: 'succeeded',
        pageReviewed: resolved.analysis.pages.length,
        resultSummary: review.summary,
        provider: review.provider,
        model: review.model,
      })
    })
  }
  catch (error) {
    await withTransaction(input.event, async (db) => {
      await updateProjectResourceReviewJobState(db, {
        jobId: job.id,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'REVIEW_FAILED',
      })
    })
  }

  const latest = await withClient(input.event, async (db) => {
    return getProjectResourceReviewJob(db, {
      projectId: input.projectId,
      resourceId: input.resourceId,
      jobId: job.id,
    })
  })
  if (!latest)
    throw new Error('PROJECT_RESOURCE_REVIEW_JOB_NOT_FOUND')
  return latest
}
