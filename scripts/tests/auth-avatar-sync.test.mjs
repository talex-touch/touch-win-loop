import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { it } from 'vitest'
import { syncProvisionedUserAvatar } from '../../server/services/auth/user-avatar-sync.ts'
import { buildManualAuthAvatarPath } from '../../shared/utils/user-avatar.ts'

const FEISHU_PROVISION_FILE = resolve(process.cwd(), 'server/services/feishu/user-provision.ts')
const CASDOOR_PROVISION_FILE = resolve(process.cwd(), 'server/services/casdoor/user-provision.ts')
const AUTH_AVATAR_SYNC_FILE = resolve(process.cwd(), 'server/services/auth/user-avatar-sync.ts')
const DB_FILE = resolve(process.cwd(), 'server/utils/db.ts')
const DOMAIN_FILE = resolve(process.cwd(), 'shared/types/domain.ts')

it('头像同步助手覆盖首次写入、刷新、手动头像保护与空值不覆盖场景', async () => {
  const baseUser = {
    id: 'user-1',
    username: 'tester',
    avatarUrl: null,
    isPlatformAdmin: false,
    isDisabled: false,
    createdAt: '2026-04-08T00:00:00.000Z',
    updatedAt: '2026-04-08T00:00:00.000Z',
  }
  const db = { query: async () => ({ rows: [] }) }
  const calls = []
  const sync = async (_db, userId, avatarUrl) => {
    calls.push({ userId, avatarUrl })
    return {
      ...baseUser,
      avatarUrl,
    }
  }

  const written = await syncProvisionedUserAvatar(db, baseUser, 'https://cdn.example.com/first.png', sync)
  assert.equal(written.avatarUrl, 'https://cdn.example.com/first.png')

  const refreshed = await syncProvisionedUserAvatar(db, written, 'https://cdn.example.com/refresh.png', sync)
  assert.equal(refreshed.avatarUrl, 'https://cdn.example.com/refresh.png')

  const untouched = await syncProvisionedUserAvatar(db, refreshed, '   ', sync)
  assert.equal(untouched.avatarUrl, 'https://cdn.example.com/refresh.png')

  const manualProtected = await syncProvisionedUserAvatar(
    db,
    {
      ...refreshed,
      avatarUrl: buildManualAuthAvatarPath('user-1', 'png'),
    },
    'https://cdn.example.com/manual-should-not-overwrite.png',
    sync,
  )
  assert.equal(manualProtected.avatarUrl, buildManualAuthAvatarPath('user-1', 'png'))
  assert.deepEqual(calls, [
    { userId: 'user-1', avatarUrl: 'https://cdn.example.com/first.png' },
    { userId: 'user-1', avatarUrl: 'https://cdn.example.com/refresh.png' },
  ])
})

it('oAuth 与飞书用户落库链路都会同步头像主数据', async () => {
  const feishuSource = await readFile(FEISHU_PROVISION_FILE, 'utf8')
  const casdoorSource = await readFile(CASDOOR_PROVISION_FILE, 'utf8')
  const avatarSyncSource = await readFile(AUTH_AVATAR_SYNC_FILE, 'utf8')
  const dbSource = await readFile(DB_FILE, 'utf8')
  const domainSource = await readFile(DOMAIN_FILE, 'utf8')

  assert.equal((feishuSource.match(/syncProvisionedUserAvatar\(db, [^,]+, profile\.avatarUrl\)/g) || []).length, 3, '飞书用户同步未覆盖已有身份、绑定已有用户与新注册三条路径')
  assert.equal((casdoorSource.match(/syncProvisionedUserAvatar\(db, [^,]+, profile\.avatarUrl\)/g) || []).length, 3, 'Casdoor 用户同步未覆盖已有身份、绑定已有用户与新注册三条路径')
  assert.match(avatarSyncSource, /isManualAuthAvatarUrl\(user\.avatarUrl\)/, '头像同步助手未保护手动上传头像')
  assert.match(dbSource, /ADD COLUMN IF NOT EXISTS avatar_url TEXT;/, 'users 表未补充 avatar_url 字段')
  assert.match(domainSource, /avatarUrl\?: string \| null/, 'AuthUser 未暴露 avatarUrl 字段')
})
