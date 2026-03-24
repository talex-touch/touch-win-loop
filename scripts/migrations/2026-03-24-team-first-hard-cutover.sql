-- Team-First hard cutover migration (one-shot, maintenance window)
-- Preconditions:
-- 1) Application is in maintenance mode (read-only / no writes)
-- 2) Full database backup is completed
-- 3) Execute on PostgreSQL inside a single transaction

BEGIN;

SET lock_timeout = '10s';
SET statement_timeout = '0';

-- Remove compatibility views/functions introduced by bridge migrations.
DROP VIEW IF EXISTS team_billing;
DROP VIEW IF EXISTS team_members;
DROP VIEW IF EXISTS teams;

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, tg.tgname AS trigger_name
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND tg.tgname LIKE '%_sync_team_workspace_ids'
      AND NOT tg.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', t.trigger_name, t.schema_name, t.table_name);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS sync_team_workspace_ids() CASCADE;

-- Rename core tables.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'workspace_members' AND relkind = 'r') THEN
    ALTER TABLE public.workspace_members RENAME TO team_members;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'workspace_billing' AND relkind = 'r') THEN
    ALTER TABLE public.workspace_billing RENAME TO team_billing;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'workspaces' AND relkind = 'r') THEN
    ALTER TABLE public.workspaces RENAME TO teams;
  END IF;
END $$;

-- Normalize columns: workspace_id -> team_id in all business tables.
DO $$
DECLARE
  r RECORD;
  mismatch_count BIGINT;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'workspace_id'
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c2
      WHERE c2.table_schema = r.table_schema
        AND c2.table_name = r.table_name
        AND c2.column_name = 'team_id'
    ) THEN
      -- Bridge migration had both team_id/workspace_id; ensure they are equivalent before cleanup.
      EXECUTE format(
        'SELECT count(*) FROM %I.%I WHERE team_id IS NOT NULL AND workspace_id IS NOT NULL AND team_id <> workspace_id',
        r.table_schema,
        r.table_name
      ) INTO mismatch_count;

      IF mismatch_count > 0 THEN
        RAISE EXCEPTION 'Hard cutover aborted: %.% has % rows where team_id != workspace_id.',
          r.table_schema,
          r.table_name,
          mismatch_count;
      END IF;

      EXECUTE format(
        'UPDATE %I.%I SET team_id = COALESCE(team_id, workspace_id) WHERE workspace_id IS NOT NULL',
        r.table_schema,
        r.table_name
      );
      EXECUTE format(
        'ALTER TABLE %I.%I DROP COLUMN workspace_id CASCADE',
        r.table_schema,
        r.table_name
      );
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I RENAME COLUMN workspace_id TO team_id',
      r.table_schema,
      r.table_name
    );
  END LOOP;
END $$;

-- Rename constraint names (workspace -> team).
DO $$
DECLARE
  r RECORD;
  next_name TEXT;
BEGIN
  FOR r IN
    SELECT ns.nspname AS schema_name, cls.relname AS table_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND con.conname LIKE '%workspace%'
  LOOP
    next_name := replace(replace(r.constraint_name, 'workspaces', 'teams'), 'workspace', 'team');

    IF next_name <> r.constraint_name THEN
      IF length(next_name) > 63 THEN
        next_name := left(next_name, 54) || '_' || substr(md5(next_name), 1, 8);
      END IF;

      BEGIN
        EXECUTE format(
          'ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I',
          r.schema_name,
          r.table_name,
          r.constraint_name,
          next_name
        );
      EXCEPTION
        WHEN duplicate_object THEN
          NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- Rename index names (workspace -> team).
DO $$
DECLARE
  r RECORD;
  next_name TEXT;
BEGIN
  FOR r IN
    SELECT schemaname, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname LIKE '%workspace%'
  LOOP
    next_name := replace(replace(r.indexname, 'workspaces', 'teams'), 'workspace', 'team');

    IF next_name <> r.indexname THEN
      IF length(next_name) > 63 THEN
        next_name := left(next_name, 54) || '_' || substr(md5(next_name), 1, 8);
      END IF;

      BEGIN
        EXECUTE format(
          'ALTER INDEX %I.%I RENAME TO %I',
          r.schemaname,
          r.indexname,
          next_name
        );
      EXCEPTION
        WHEN duplicate_object THEN
          NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- Post-migration integrity checks.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'workspaces'
  ) THEN
    RAISE EXCEPTION 'Hard cutover failed: table public.workspaces still exists.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'workspace_id'
  ) THEN
    RAISE EXCEPTION 'Hard cutover failed: workspace_id columns still exist.';
  END IF;
END $$;

COMMIT;
