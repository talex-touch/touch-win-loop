import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'

const SCHEMA_FILE = resolve(process.cwd(), 'server/database/bootstrap/schema.ts')
const MIGRATION_FILE = resolve(process.cwd(), 'scripts/migrations/2026-04-18-project-defense-schema.sql')

it('答辩项目表已进入 bootstrap schema 与显式迁移脚本', async () => {
  const [schemaSource, migrationSource] = await Promise.all([
    readFile(SCHEMA_FILE, 'utf8'),
    readFile(MIGRATION_FILE, 'utf8'),
  ])

  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_defense_personas \([\s\S]*project_id TEXT NOT NULL REFERENCES projects\(id\) ON DELETE CASCADE,/)
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_defense_session_state[\s\S]*realtime_meta_json JSONB NOT NULL DEFAULT '\{\}'::JSONB,/)
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_defense_turns[\s\S]*persona_id TEXT REFERENCES project_defense_personas\(id\) ON DELETE SET NULL,/)
  assert.match(schemaSource, /CREATE TABLE IF NOT EXISTS project_defense_summaries[\s\S]*summary_type TEXT NOT NULL CHECK \(summary_type IN \('turn', 'session'\)\),/)
  assert.match(schemaSource, /CREATE INDEX IF NOT EXISTS idx_project_defense_personas_project_sort/)
  assert.match(schemaSource, /CREATE INDEX IF NOT EXISTS idx_project_defense_turns_session_turn_created/)
  assert.match(schemaSource, /CREATE INDEX IF NOT EXISTS idx_project_defense_summaries_session_lookup/)
  assert.match(schemaSource, /CREATE INDEX IF NOT EXISTS idx_project_defense_summaries_project_latest/)

  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS project_defense_personas/)
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS project_defense_session_state/)
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS project_defense_turns/)
  assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS project_defense_summaries/)
  assert.match(migrationSource, /ALTER TABLE IF EXISTS project_defense_session_state[\s\S]*ADD COLUMN IF NOT EXISTS realtime_meta_json JSONB NOT NULL DEFAULT '\{\}'::JSONB;/)
})
