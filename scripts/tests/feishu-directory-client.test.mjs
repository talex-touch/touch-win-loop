import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, it, vi } from 'vitest'
import { listFeishuTenantDirectory } from '../../server/services/feishu/client.ts'
import { getFeishuDirectorySnapshot } from '../../server/services/feishu/directory-cache.ts'

function ok(data) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: 0,
      data,
    }),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('listFeishuTenantDirectory 会继续遍历部门树并保留成员部门归属', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = String(input)

    if (url.includes('/open-apis/contact/v3/users?') && !url.includes('department_id=')) {
      return ok({
        items: [
          {
            union_id: 'on_root_only',
            user_id: 'ou_root_only',
            name: '根部门直属成员',
          },
        ],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/users?department_id=0')) {
      return ok({
        items: [
          {
            union_id: 'on_root_only',
            user_id: 'ou_root_only',
            name: '根部门直属成员',
          },
        ],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/departments?') && url.includes('parent_department_id=0')) {
      return ok({
        items: [
          {
            department_id: 'od_child_1',
            parent_department_id: '0',
          },
        ],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/users?department_id=od_child_1')) {
      return ok({
        items: [
          {
            union_id: 'on_child_member',
            user_id: 'ou_child_member',
            name: '子部门成员',
          },
        ],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/departments/od_child_1/children')) {
      return ok({
        items: [],
        has_more: false,
      })
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }))

  const directory = await listFeishuTenantDirectory({
    tenantAccessToken: 'tenant_token',
    maxUsers: 50,
  })

  assert.equal(directory.rootDepartmentId, '0')
  assert.equal(directory.users.length, 2)
  assert.deepEqual(
    directory.users.map(user => user.unionId).sort(),
    ['on_child_member', 'on_root_only'],
  )
  assert.deepEqual(directory.userDepartmentIds.on_root_only, ['0'])
  assert.deepEqual(directory.userDepartmentIds.on_child_member, ['od_child_1'])
  assert.ok(directory.departments.some(item => item.departmentId === '0'))
  assert.ok(directory.departments.some(item => item.departmentId === 'od_child_1' && item.parentDepartmentId === '0'))
  assert.equal(directory.directoryStatus, 'ok')
  assert.equal(directory.memberListStatus, 'ok')
  assert.equal(directory.departmentTreeStatus, 'ok')
  assert.equal(directory.diagnosticCode, 'none')
})

it('listFeishuTenantDirectory 会在直连全员列表失败时继续回退到部门遍历', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = String(input)

    if (url.includes('/open-apis/contact/v3/users?') && !url.includes('department_id=')) {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          code: 99991663,
          msg: 'no dept authority error',
        }),
      }
    }

    if (url.includes('/open-apis/contact/v3/users?department_id=0') && url.includes('department_id_type=department_id')) {
      return ok({
        items: [
          {
            union_id: 'on_root_member',
            user_id: 'ou_root_member',
            name: '根部门成员',
          },
        ],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/departments?') && url.includes('parent_department_id=0') && url.includes('department_id_type=department_id')) {
      return ok({
        items: [],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/users?department_id=0') || url.includes('/open-apis/contact/v3/departments?parent_department_id=0')) {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          code: 99991663,
          msg: 'no dept authority error',
        }),
      }
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }))

  const directory = await listFeishuTenantDirectory({
    tenantAccessToken: 'tenant_token',
    maxUsers: 50,
  })

  assert.equal(directory.users.length, 1)
  assert.equal(directory.users[0]?.unionId, 'on_root_member')
  assert.deepEqual(directory.userDepartmentIds.on_root_member, ['0'])
})

it('listFeishuTenantDirectory 会在部门树失败时保留已拿到的成员列表', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = String(input)

    if (url.includes('/open-apis/contact/v3/users?') && !url.includes('department_id=')) {
      return ok({
        items: [
          {
            union_id: 'on_direct_member',
            user_id: 'ou_direct_member',
            name: '直连成员',
          },
        ],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/users?department_id=0') || url.includes('/open-apis/contact/v3/departments?parent_department_id=0')) {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          code: 99991663,
          msg: 'no dept authority error',
        }),
      }
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }))

  const directory = await listFeishuTenantDirectory({
    tenantAccessToken: 'tenant_token',
    maxUsers: 50,
  })

  assert.equal(directory.users.length, 1)
  assert.equal(directory.users[0]?.unionId, 'on_direct_member')
  assert.deepEqual(directory.departments, [
    {
      departmentId: '0',
      name: '飞书组织',
      parentDepartmentId: null,
    },
  ])
  assert.equal(directory.directoryStatus, 'partial')
  assert.equal(directory.memberListStatus, 'ok')
  assert.equal(directory.departmentTreeStatus, 'failed')
  assert.equal(directory.diagnosticCode, 'department_tree_permission_denied')
  assert.match(directory.notice || '', /部门树加载失败/)
  assert.match(directory.diagnosticMessage || '', /no dept authority error/)
})

it('listFeishuTenantDirectory 会优先通过根部门列表接口枚举子部门', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = String(input)

    if (url.includes('/open-apis/contact/v3/users?') && !url.includes('department_id=')) {
      return ok({
        items: [
          {
            union_id: 'on_root_member',
            user_id: 'ou_root_member',
            name: '根直属成员',
          },
        ],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/users?department_id=0')) {
      return ok({
        items: [
          {
            union_id: 'on_root_member',
            user_id: 'ou_root_member',
            name: '根直属成员',
          },
        ],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/departments?') && url.includes('parent_department_id=0')) {
      return ok({
        items: [
          {
            department_id: 'od_ops',
            parent_department_id: '0',
            name: '运营部',
          },
        ],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/users?department_id=od_ops')) {
      return ok({
        items: [
          {
            union_id: 'on_ops_member',
            user_id: 'ou_ops_member',
            name: '运营成员',
          },
        ],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/departments/od_ops/children')) {
      return ok({
        items: [],
        has_more: false,
      })
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }))

  const directory = await listFeishuTenantDirectory({
    tenantAccessToken: 'tenant_token',
    maxUsers: 50,
  })

  assert.deepEqual(
    directory.users.map(user => user.unionId).sort(),
    ['on_ops_member', 'on_root_member'],
  )
  assert.ok(directory.departments.some(item => item.departmentId === 'od_ops' && item.parentDepartmentId === '0'))
})

it('getFeishuDirectorySnapshot 会把全量目录整体不可用标记为 unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = String(input)

    if (url.includes('/open-apis/auth/v3/tenant_access_token/internal')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          tenant_access_token: 'tenant_token',
        }),
      }
    }

    if (url.includes('/open-apis/contact/v3/scopes')) {
      return ok({
        department_ids: ['0'],
        user_ids: ['on_4b400fe5c4d40cd564431c5944a699cb'],
        group_ids: [],
        has_more: false,
      })
    }

    if (url.includes('/open-apis/contact/v3/users?') && !url.includes('department_id=')) {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          code: 99991663,
          msg: 'no dept authority error',
        }),
      }
    }

    if (url.includes('/open-apis/contact/v3/users?department_id=0') || url.includes('/open-apis/contact/v3/departments?parent_department_id=0')) {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          code: 99991663,
          msg: 'no dept authority error',
        }),
      }
    }

    throw new Error(`Unexpected fetch: ${url}`)
  }))

  const snapshot = await getFeishuDirectorySnapshot({
    config: {
      appId: 'cli_unavailable_case',
      appSecret: 'secret',
      adminGroupIds: [],
    },
    forceRefresh: true,
    maxUsers: 50,
  })

  assert.equal(snapshot.directoryStatus, 'unavailable')
  assert.equal(snapshot.memberListStatus, 'failed')
  assert.equal(snapshot.departmentTreeStatus, 'failed')
  assert.equal(snapshot.contactScopeStatus, 'ok')
  assert.equal(snapshot.contactScopeSummary?.totalDepartments, 1)
  assert.equal(snapshot.contactScopeSummary?.totalUsers, 1)
  assert.equal(snapshot.diagnosticCode, 'directory_unavailable')
  assert.match(snapshot.diagnosticMessage, /no dept authority error/)
})

it('飞书管理页已切换到目录浏览组件，并保留管理员组配置入口', async () => {
  const pageSource = await readFile(resolve(process.cwd(), 'app/pages/admin/integrations/feishu.vue'), 'utf8')
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuDirectoryBrowser.vue'), 'utf8')

  assert.match(pageSource, /useFeishuDirectoryBrowser/, '页面仍未切换到目录浏览 composable')
  assert.match(pageSource, /AdminFeishuDirectoryBrowser/, '页面仍未切换到新的目录浏览组件')
  assert.match(pageSource, /adminGroupIdsText/, '配置表单缺少 adminGroupIdsText 字段')
  assert.match(pageSource, /directory-status/, '页面未向目录组件透传结构化目录状态')
  assert.match(componentSource, /<a-tree/, '目录浏览组件缺少左侧部门树')
  assert.match(componentSource, /搜索时会覆盖全员/, '目录浏览组件未声明全局搜索语义')
  assert.match(componentSource, /showPartialDiagnostic/, '目录浏览组件未接入部分异常诊断展示')
  assert.match(componentSource, /范围自检：/, '目录浏览组件未展示通讯录范围自检结果')
  assert.match(componentSource, /部门树当前不可用/, '目录浏览组件缺少部门树降级提示')
})
