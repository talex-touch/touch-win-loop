-- Restore workspace-based schema from Team-First hard cutover.
-- This migration is intended for environments where current application code
-- still expects workspaces/workspace_id, but the database was switched to
-- teams/team_id by the one-shot hard cutover migration.

BEGIN;

SET lock_timeout = '10s';
SET statement_timeout = '0';

DO $$
DECLARE
  row_count BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'workspace_members'
      AND relkind = 'r'
  ) AND EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'team_members'
      AND relkind = 'r'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.workspace_members' INTO row_count;
    IF row_count > 0 THEN
      RAISE EXCEPTION 'Restore aborted: public.workspace_members already has % rows. Manual reconciliation required.', row_count;
    END IF;
    EXECUTE 'DROP TABLE public.workspace_members';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'workspace_billing'
      AND relkind = 'r'
  ) AND EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'team_billing'
      AND relkind = 'r'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.workspace_billing' INTO row_count;
    IF row_count > 0 THEN
      RAISE EXCEPTION 'Restore aborted: public.workspace_billing already has % rows. Manual reconciliation required.', row_count;
    END IF;
    EXECUTE 'DROP TABLE public.workspace_billing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'workspaces'
      AND relkind = 'r'
  ) AND EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'teams'
      AND relkind = 'r'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.workspaces' INTO row_count;
    IF row_count > 0 THEN
      RAISE EXCEPTION 'Restore aborted: public.workspaces already has % rows. Manual reconciliation required.', row_count;
    END IF;
    EXECUTE 'DROP TABLE public.workspaces';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'team_members'
      AND relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'workspace_members'
      AND relkind = 'r'
  ) THEN
    ALTER TABLE public.team_members RENAME TO workspace_members;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'team_billing'
      AND relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'workspace_billing'
      AND relkind = 'r'
  ) THEN
    ALTER TABLE public.team_billing RENAME TO workspace_billing;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'teams'
      AND relkind = 'r'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'workspaces'
      AND relkind = 'r'
  ) THEN
    ALTER TABLE public.teams RENAME TO workspaces;
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
  mismatch_count BIGINT;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'team_id'
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns c2
      WHERE c2.table_schema = r.table_schema
        AND c2.table_name = r.table_name
        AND c2.column_name = 'workspace_id'
    ) THEN
      EXECUTE format(
        'SELECT count(*) FROM %I.%I WHERE team_id IS NOT NULL AND workspace_id IS NOT NULL AND team_id <> workspace_id',
        r.table_schema,
        r.table_name
      ) INTO mismatch_count;

      IF mismatch_count > 0 THEN
        RAISE EXCEPTION 'Restore aborted: %.% has % rows where team_id != workspace_id.',
          r.table_schema,
          r.table_name,
          mismatch_count;
      END IF;

      EXECUTE format(
        'UPDATE %I.%I SET workspace_id = COALESCE(workspace_id, team_id) WHERE team_id IS NOT NULL',
        r.table_schema,
        r.table_name
      );
      EXECUTE format(
        'ALTER TABLE %I.%I DROP COLUMN team_id CASCADE',
        r.table_schema,
        r.table_name
      );
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.%I RENAME COLUMN team_id TO workspace_id',
      r.table_schema,
      r.table_name
    );
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('teams', 'team_members', 'team_billing')
  ) THEN
    RAISE EXCEPTION 'Restore failed: team-first tables still exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'team_id'
  ) THEN
    RAISE EXCEPTION 'Restore failed: team_id columns still exist.';
  END IF;
END $$;

COMMIT;
