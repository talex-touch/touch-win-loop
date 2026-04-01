import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, it, vi } from 'vitest'
import { listFeishuTenantDirectory } from '../../server/services/feishu/client.ts'

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

    if (url.includes('/open-apis/contact/v3/departments/0/children')) {
      return ok({
        items: [
          {
            department_id: 'od_child_1',
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
})

it('飞书管理页已切换到目录浏览组件，并保留管理员组配置入口', async () => {
  const pageSource = await readFile(resolve(process.cwd(), 'app/pages/admin/integrations/feishu.vue'), 'utf8')
  const componentSource = await readFile(resolve(process.cwd(), 'app/components/admin/AdminFeishuDirectoryBrowser.vue'), 'utf8')

  assert.match(pageSource, /useFeishuDirectoryBrowser/, '页面仍未切换到目录浏览 composable')
  assert.match(pageSource, /AdminFeishuDirectoryBrowser/, '页面仍未切换到新的目录浏览组件')
  assert.match(pageSource, /adminGroupIdsText/, '配置表单缺少 adminGroupIdsText 字段')
  assert.match(componentSource, /<a-tree/, '目录浏览组件缺少左侧部门树')
  assert.match(componentSource, /搜索时会覆盖全员/, '目录浏览组件未声明全局搜索语义')
})
