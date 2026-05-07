CREATE TABLE IF NOT EXISTS project_knowledge_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('project_resource', 'contest_resource')),
  source_resource_id TEXT REFERENCES project_resources(id) ON DELETE CASCADE,
  linked_contest_resource_id TEXT REFERENCES contest_resources(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'extracting', 'chunking', 'embedding', 'ready', 'failed', 'stale', 'skipped')),
  progress_percent INTEGER NOT NULL DEFAULT 0,
  eta_seconds INTEGER NOT NULL DEFAULT 0,
  chunk_total INTEGER NOT NULL DEFAULT 0,
  chunk_indexed INTEGER NOT NULL DEFAULT 0,
  source_hash TEXT NOT NULL DEFAULT '',
  index_version TEXT NOT NULL DEFAULT '',
  last_indexed_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT '',
  last_error_stage TEXT NOT NULL DEFAULT '',
  last_task_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_knowledge_sources_target_check
    CHECK (source_resource_id IS NOT NULL OR linked_contest_resource_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS project_knowledge_index_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('project_resource', 'contest_resource')),
  source_resource_id TEXT REFERENCES project_resources(id) ON DELETE CASCADE,
  linked_contest_resource_id TEXT REFERENCES contest_resources(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('upsert', 'reindex', 'delete')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
  stage TEXT NOT NULL DEFAULT 'queued' CHECK (stage IN ('queued', 'extracting', 'chunking', 'embedding', 'finalizing')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempt INTEGER NOT NULL DEFAULT 3,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  eta_seconds INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  result_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_knowledge_index_tasks_target_check
    CHECK (source_resource_id IS NOT NULL OR linked_contest_resource_id IS NOT NULL)
);

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'vector'
  ) THEN
    CREATE TABLE IF NOT EXISTS project_knowledge_chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES project_knowledge_sources(id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('project_resource', 'contest_resource')),
      source_resource_id TEXT REFERENCES project_resources(id) ON DELETE CASCADE,
      linked_contest_resource_id TEXT REFERENCES contest_resources(id) ON DELETE SET NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      chunk_kind TEXT NOT NULL CHECK (chunk_kind IN ('document_page', 'document_section', 'markdown_section', 'draw_summary', 'resource_summary', 'image_summary', 'image_ocr', 'meeting_notes', 'meeting_transcript')),
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      citation_label TEXT NOT NULL DEFAULT '',
      page_number INTEGER,
      section_label TEXT NOT NULL DEFAULT '',
      source_hash TEXT NOT NULL DEFAULT '',
      index_version TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
      embedding vector,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source_id, chunk_index, source_hash)
    );
  ELSE
    CREATE TABLE IF NOT EXISTS project_knowledge_chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES project_knowledge_sources(id) ON DELETE CASCADE,
      scope_type TEXT NOT NULL CHECK (scope_type IN ('project_resource', 'contest_resource')),
      source_resource_id TEXT REFERENCES project_resources(id) ON DELETE CASCADE,
      linked_contest_resource_id TEXT REFERENCES contest_resources(id) ON DELETE SET NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      chunk_kind TEXT NOT NULL CHECK (chunk_kind IN ('document_page', 'document_section', 'markdown_section', 'draw_summary', 'resource_summary', 'image_summary', 'image_ocr', 'meeting_notes', 'meeting_transcript')),
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      citation_label TEXT NOT NULL DEFAULT '',
      page_number INTEGER,
      section_label TEXT NOT NULL DEFAULT '',
      source_hash TEXT NOT NULL DEFAULT '',
      index_version TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
      embedding_json JSONB NOT NULL DEFAULT '[]'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source_id, chunk_index, source_hash)
    );
  END IF;
END $$;

DO $$
DECLARE
  project_knowledge_chunk_kind_check_name TEXT;
BEGIN
  SELECT con.conname
    INTO project_knowledge_chunk_kind_check_name
  FROM pg_constraint con
  JOIN pg_class rel
    ON rel.oid = con.conrelid
  WHERE rel.relname = 'project_knowledge_chunks'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%chunk_kind%'
  LIMIT 1;

  IF project_knowledge_chunk_kind_check_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE project_knowledge_chunks DROP CONSTRAINT %I', project_knowledge_chunk_kind_check_name);
  END IF;

  ALTER TABLE project_knowledge_chunks
    ADD CONSTRAINT project_knowledge_chunks_chunk_kind_check
    CHECK (chunk_kind IN (
      'document_page',
      'document_section',
      'markdown_section',
      'draw_summary',
      'resource_summary',
      'image_summary',
      'image_ocr',
      'meeting_notes',
      'meeting_transcript'
    ));
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_knowledge_sources_project_scope_entity
  ON project_knowledge_sources(project_id, scope_type, COALESCE(source_resource_id, ''), COALESCE(linked_contest_resource_id, ''));

CREATE INDEX IF NOT EXISTS idx_project_knowledge_sources_project_status
  ON project_knowledge_sources(project_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_knowledge_sources_resource
  ON project_knowledge_sources(project_id, source_resource_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_knowledge_index_tasks_active_unique
  ON project_knowledge_index_tasks(project_id, scope_type, COALESCE(source_resource_id, ''), COALESCE(linked_contest_resource_id, ''))
  WHERE status IN ('queued', 'processing');

CREATE INDEX IF NOT EXISTS idx_project_knowledge_index_tasks_status_updated
  ON project_knowledge_index_tasks(project_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_knowledge_index_tasks_resource
  ON project_knowledge_index_tasks(project_id, source_resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_knowledge_chunks_project_source
  ON project_knowledge_chunks(project_id, source_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_knowledge_chunks_project_resource
  ON project_knowledge_chunks(project_id, source_resource_id, updated_at DESC);
