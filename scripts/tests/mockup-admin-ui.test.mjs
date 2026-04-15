import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { it } from "vitest";

const ADMIN_PAGE_FILE = resolve(
  process.cwd(),
  "app/pages/admin/mockups.vue",
);
const ADMIN_CANVAS_LIBRARY_PAGE_FILE = resolve(
  process.cwd(),
  "app/pages/admin/canvas-library.vue",
);
const ADMIN_MOCKUP_COMPONENT_FILE = resolve(
  process.cwd(),
  "app/components/admin/canvas-library/AdminCanvasLibraryMockupModelsManager.vue",
);
const ADMIN_SUBNAV_FILE = resolve(
  process.cwd(),
  "app/components/admin/AdminSubnav.vue",
);
const DESIGN_PANEL_FILE = resolve(
  process.cwd(),
  "app/components/workspace/WorkspaceDesignPanel.vue",
);
const DESIGN_INSPECTOR_FILE = resolve(
  process.cwd(),
  "app/components/workspace/design/WorkspaceDesignInspector.vue",
);
const DESIGN_STAGE_FILE = resolve(
  process.cwd(),
  "app/components/workspace/design/WorkspaceDesignStage.vue",
);

it("Mockup 型号已并入画布资源库，并保留兼容路由跳转", async () => {
  const [adminPageSource, adminCanvasLibraryPageSource, adminMockupComponentSource, adminSubnavSource] = await Promise.all([
    readFile(ADMIN_PAGE_FILE, "utf8"),
    readFile(ADMIN_CANVAS_LIBRARY_PAGE_FILE, "utf8"),
    readFile(ADMIN_MOCKUP_COMPONENT_FILE, "utf8"),
    readFile(ADMIN_SUBNAV_FILE, "utf8"),
  ]);

  assert.doesNotMatch(adminSubnavSource, /to: '\/admin\/mockups'/, "Admin 导航不应再保留独立 Mockup 专项入口");
  assert.match(adminCanvasLibraryPageSource, /Mockup 型号/, "画布资源库页缺少 Mockup 型号 tab");
  assert.match(adminMockupComponentSource, /"variant_1"[\s\S]*"variant_4"/, "Mockup 型号管理缺少固定 4 个 variant 槽位");
  assert.match(adminMockupComponentSource, /"\/admin\/mockups\/models"/, "Mockup 型号管理未接入型号目录接口");
  assert.match(adminMockupComponentSource, /仅允许绑定已发布的 `device_shell`/, "Mockup 型号管理未限制正式壳资产来源");
  assert.match(adminMockupComponentSource, /去素材列表/, "Mockup 型号管理缺少跳转回素材列表入口");
  assert.match(adminPageSource, /navigateTo\(/, "旧 Mockup 路由缺少兼容跳转");
  assert.match(adminPageSource, /tab:\s*"mockups"/, "旧 Mockup 路由未跳到画布资源库的 mockups tab");
});

it("设计画布已接入 mockup 整体拖动与屏幕构图编辑态", async () => {
  const [designPanelSource, inspectorSource, stageSource] = await Promise.all([
    readFile(DESIGN_PANEL_FILE, "utf8"),
    readFile(DESIGN_INSPECTOR_FILE, "utf8"),
    readFile(DESIGN_STAGE_FILE, "utf8"),
  ]);

  assert.match(inspectorSource, /调整屏幕内容/, "Inspector 缺少进入屏幕构图编辑态入口");
  assert.match(inspectorSource, /重置构图/, "Inspector 缺少构图重置动作");
  assert.match(inspectorSource, /screenTransform/, "Inspector 未接入 screenTransform 控件");
  assert.match(stageSource, /'edit-mockup-screen'/, "Stage 未暴露进入 mockup 内部编辑态事件");
  assert.match(stageSource, /'update-mockup-screen-transform'/, "Stage 未暴露 mockup 屏幕偏移更新事件");
  assert.match(stageSource, /mockupScreenEditingFrameId/, "Stage 未接入 mockup 内部编辑态 frameId");
  assert.match(designPanelSource, /@edit-mockup-screen="mockupScreenEditingFrameId = \$event\.frameId"/, "设计面板未接住 mockup 内部编辑事件");
  assert.match(designPanelSource, /@update-mockup-screen-transform="/, "设计面板未接住 mockup 屏幕拖动更新");
  assert.match(designPanelSource, /scale: Number\(targetFrame\.metadata\?\.device\?\.screenTransform\?\.scale \|\| 1\)/, "设计面板更新 screenTransform 时未保留 scale");
});
