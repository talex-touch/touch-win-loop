import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { it } from "vitest";

const DESIGN_PANEL_FILE = resolve(
  process.cwd(),
  "app/components/workspace/WorkspaceDesignPanel.vue",
);
const DESIGN_INSPECTOR_FILE = resolve(
  process.cwd(),
  "app/components/workspace/design/WorkspaceDesignInspector.vue",
);
const DESIGN_LAYOUT_FILE = resolve(
  process.cwd(),
  "app/components/wl-design/WLDesignLayout.vue",
);

it("设计属性面板改为命令栏 + 持久属性分组，并避免继续渲染假控件", async () => {
  const source = await readFile(DESIGN_INSPECTOR_FILE, "utf8");

  assert.doesNotMatch(
    source,
    /<h3 class="text-sm font-bold text-slate-900">[\s\S]*属性[\s\S]*<\/h3>/,
    "Inspector 仍保留内层重复标题",
  );
  assert.match(
    source,
    /workspace-design-inspector__command-strip/,
    "Inspector 缺少顶置 selection command strip",
  );
  assert.match(
    source,
    /workspace-design-inspector__command-grid/,
    "Inspector 缺少命令栏网格",
  );
  assert.match(
    source,
    /workspace-design-inspector__command-row--adaptive/,
    "Inspector 第一排命令未改成自适应分布",
  );
  assert.match(
    source,
    /workspace-design-inspector__command-tooltip/,
    "Inspector 命令按钮缺少自定义 tooltip",
  );
  assert.match(source, /几何/, "Inspector 缺少几何分组");
  assert.match(source, /布局/, "Inspector 缺少布局分组");
  assert.match(source, /图层/, "Inspector 缺少图层分组");
  assert.match(source, /填充/, "Inspector 缺少填充分组");
  assert.match(source, /描边/, "Inspector 缺少描边分组");
  assert.match(source, /效果/, "Inspector 缺少效果分组");
  assert.match(source, /导出/, "Inspector 缺少导出分组");
  assert.match(source, /实时预览/, "Inspector 缺少设备实时预览分组");
  assert.match(source, /裸屏预览/, "Inspector 缺少裸屏预览切换");
  assert.match(source, /带壳预览/, "Inspector 缺少带壳预览切换");
  assert.match(source, /联动源画板/, "Inspector 缺少 mockup 联动画板选择器");
  assert.match(source, /壳来源/, "Inspector 缺少设备壳来源选择器");
  assert.match(source, /搜索预设/, "Inspector 缺少设备预设搜索入口");
  assert.match(
    source,
    /workspace-design-inspector__compact-grid/,
    "Inspector 缺少紧凑属性网格",
  );
  assert.match(
    source,
    /compact-label">X<\/span>[\s\S]*compact-label">Y<\/span>[\s\S]*compact-label">W<\/span>[\s\S]*compact-label">H<\/span>/,
    "Inspector 未把 X\/Y\/W\/H 收敛到紧凑网格顶部",
  );
  assert.match(source, /超出容器不显示/, "Inspector 缺少裁剪勾选项");
  assert.match(
    source,
    /不暴露假面板/,
    "Inspector 未显式说明不支持能力不会渲染假控件",
  );
  assert.match(
    source,
    /workspace-design-inspector__icon-button/,
    "Inspector 缺少 icon-only 操作按钮",
  );
  assert.match(
    source,
    /workspace-design-inspector__section-toggle/,
    "Inspector 缺少分组折叠按钮",
  );
  assert.match(
    source,
    /workspace-design-inspector__command-button--icon/,
    "Inspector 未把命令栏收敛成 icon 按钮",
  );
  assert.doesNotMatch(
    source,
    /:title="command\.label"/,
    "Inspector 命令按钮仍在使用原生 title 而不是自定义 tooltip",
  );
  assert.match(
    source,
    /material-symbols-outlined/,
    "Inspector 未复用 material icon 体系",
  );
  assert.doesNotMatch(
    source,
    /<h4 class="workspace-design-inspector__group-title">\s*选择命令\s*<\/h4>/,
    "Inspector 仍保留选择命令标题",
  );
  assert.doesNotMatch(
    source,
    /不写入额外 schema|不引入新的持久字段/,
    "Inspector 仍保留选择命令描述文案",
  );
  assert.doesNotMatch(
    source,
    /getSectionToggleLabel\('(?:element|frame)', 'commands'/,
    "Inspector 仍保留选择命令折叠按钮",
  );
  assert.doesNotMatch(
    source,
    /1 个元素|1 个画板/,
    "Inspector 摘要区仍然暴露单个对象计数",
  );
  assert.doesNotMatch(
    source,
    /workspace-design-inspector__summary/,
    "Inspector 顶部仍保留独立摘要块，没有并入统一头部",
  );
});

it("设计两侧面板都通过单容器 clip-path 收缩为一个 icon", async () => {
  const [panelSource, layoutSource] = await Promise.all([
    readFile(DESIGN_PANEL_FILE, "utf8"),
    readFile(DESIGN_LAYOUT_FILE, "utf8"),
  ]);

  assert.match(
    panelSource,
    /:collapsed-left-width="36"/,
    "设计布局未按 36px 收紧左侧面板折叠宽度",
  );
  assert.match(
    panelSource,
    /:left-collapsed="sidebarCollapsed"/,
    "设计布局未接入左侧面板折叠状态",
  );
  assert.match(
    panelSource,
    /workspace-design-sidebar-panel/,
    "设计面板缺少独立 sidebar panel 类名",
  );
  assert.match(
    panelSource,
    /:data-collapsed="sidebarCollapsed \? 'true' : 'false'"/,
    "设计面板未向 sidebar 容器透传折叠状态",
  );
  assert.match(
    panelSource,
    /workspace-design-sidebar-toggle[\s\S]*left_panel_close[\s\S]*workspace-design-sidebar-toggle[\s\S]*right_panel_open/,
    "设计面板未为左侧面板提供镜像收起与展开按钮",
  );
  assert.match(
    panelSource,
    /clip-path:\s*inset\(0 calc\(100% - 36px\) calc\(100% - 36px\) 0 round 10px\)/,
    "设计面板未按 36px 用 clip-path 把左侧 panel 收缩成单个 icon",
  );
  assert.match(
    panelSource,
    /:collapsed-right-width="36"/,
    "设计布局未按 36px 收紧 inspector 折叠宽度",
  );
  assert.match(
    panelSource,
    /workspace-design-inspector-panel/,
    "设计面板缺少独立 inspector panel 类名",
  );
  assert.match(
    panelSource,
    /:data-collapsed="inspectorCollapsed \? 'true' : 'false'"/,
    "设计面板未向 inspector 容器透传折叠状态",
  );
  assert.match(
    panelSource,
    /inspectorCollapsed \? ["']left_panel_open["'] : ["']right_panel_close["']/,
    "设计面板未复用同一个按钮切换收起与展开",
  );
  assert.match(
    panelSource,
    /clip-path:\s*inset\(0 0 calc\(100% - 36px\) calc\(100% - 36px\) round 10px\)/,
    "设计面板未按 36px 用 clip-path 把整块 panel 收缩成单个 icon",
  );
  assert.match(
    panelSource,
    /workspace-design-inspector-host flex h-full min-h-0 w-full items-stretch justify-end overflow-hidden/,
    "设计面板右栏未撑满高度形成独立滚动容器",
  );
  assert.match(
    panelSource,
    /workspace-design-inspector-panel h-full min-h-0 max-h-full w-full/,
    "设计面板 inspector 容器未改成满高滚动模式",
  );
  assert.match(
    panelSource,
    /const inspectorSelectionTag = computed\(/,
    "设计面板顶部缺少当前对象类型 tag",
  );
  assert.match(
    panelSource,
    /const inspectorHeaderTitle = computed\(/,
    "设计面板顶部缺少动态标题",
  );
  assert.match(
    panelSource,
    /const canRenameInspectorHeader = computed\(/,
    "设计面板顶部缺少标题重命名能力",
  );
  assert.match(
    panelSource,
    /function openInspectorRenamePrompt\(/,
    "设计面板顶部缺少点击标题重命名逻辑",
  );
  assert.match(
    panelSource,
    /function submitInspectorHeaderRename\(/,
    "设计面板顶部缺少原位提交重命名逻辑",
  );
  assert.match(
    panelSource,
    /function cancelInspectorHeaderRename\(/,
    "设计面板顶部缺少取消重命名逻辑",
  );
  assert.match(
    panelSource,
    /<template #header-title>/,
    "设计面板未使用自定义标题槽承载可点击名称",
  );
  assert.match(
    panelSource,
    /<template #header-extra>/,
    "设计面板头部缺少第二行快捷操作区",
  );
  assert.match(
    panelSource,
    /当前对象类型：\$\{inspectorSelectionTag\}/,
    "设计面板顶部 tag 缺少 tooltip",
  );
  assert.doesNotMatch(
    panelSource,
    /当前选中对象的几何、样式和容器属性。/,
    "设计面板顶部仍保留冗余副标题",
  );
  assert.doesNotMatch(
    panelSource,
    /<template #header-title-extra>/,
    "设计面板仍把状态 tag 放在标题右侧",
  );
  assert.doesNotMatch(
    panelSource,
    /inspectorHeaderMeta/,
    "设计面板头部仍残留额外 meta 文案",
  );
  assert.match(
    panelSource,
    /workspace-design-inspector-header-icon/,
    "设计面板头部快捷操作未收口成纯 icon",
  );
  assert.match(
    panelSource,
    /上传 SVG \/ PNG 设备壳/,
    "设计面板资源侧栏缺少设备壳上传入口",
  );
  assert.match(
    panelSource,
    /普通图片资源/,
    "设计面板资源侧栏缺少普通图片资源分区",
  );
  assert.match(
    panelSource,
    /设备壳资源/,
    "设计面板资源侧栏缺少设备壳资源分区",
  );
  assert.match(
    panelSource,
    /v-if="inspectorHeaderEditing"/,
    "设计面板顶部未切换成原位输入框编辑",
  );
  assert.match(
    panelSource,
    /@keydown\.enter\.prevent="submitInspectorHeaderRename"/,
    "设计面板顶部输入框未支持回车提交",
  );
  assert.match(
    panelSource,
    /@keydown\.esc\.prevent="cancelInspectorHeaderRename"/,
    "设计面板顶部输入框未支持 Esc 取消",
  );
  assert.doesNotMatch(
    panelSource,
    /window\.prompt/,
    "设计面板顶部仍在使用浏览器原生 prompt 改名",
  );
  assert.match(
    layoutSource,
    /transition:\s*width 240ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
    "设计布局未给右栏宽度增加过渡动画",
  );
});

it("设计属性更新后显式恢复当前 selection，避免 inspector 回退到 page", async () => {
  const panelSource = await readFile(DESIGN_PANEL_FILE, "utf8");

  assert.match(
    panelSource,
    /function cloneSelectionStateSnapshot\(/,
    "设计面板缺少 selection 快照工具",
  );
  assert.match(
    panelSource,
    /:element-frame="selectedElementFrame"/,
    "设计面板没有把元素所属 frame 传给 inspector",
  );
  assert.match(
    panelSource,
    /:selected-element-count="selectedElementIds.length"/,
    "设计面板没有把元素选择数量传给 inspector",
  );
  assert.match(
    panelSource,
    /@run-selection-command="runSelectionCommand"/,
    "设计面板没有回接 inspector 命令栏事件",
  );
  assert.match(
    panelSource,
    /const selectionSnapshot = cloneSelectionStateSnapshot\(selectionState\.value\)[\s\S]*commitDocument\([\s\S]*updateDesignFrameInSceneDocument[\s\S]*replaceSelectionState\(selectionSnapshot\)/,
    "Frame 属性更新后未恢复 selection",
  );
  assert.match(
    panelSource,
    /const selectionSnapshot = cloneSelectionStateSnapshot\(selectionState\.value\)[\s\S]*commitDocument\([\s\S]*updateDesignElementInSceneDocument[\s\S]*replaceSelectionState\(selectionSnapshot\)/,
    "Element 属性更新后未恢复 selection",
  );
  assert.match(
    panelSource,
    /watch\(\s*\[\(\) => props\.modelValue, isBoundToDesignResource\][\s\S]*const selectionSnapshot = cloneSelectionStateSnapshot\(selectionState\.value\)[\s\S]*setDraftDocument\(resolved\.document\)[\s\S]*replaceSelectionState\(selectionSnapshot\)/,
    "外部 modelValue 回灌时仍未恢复 selection",
  );
  assert.doesNotMatch(
    panelSource,
    /designSelection\.replaceSelection\(createEmptyDesignCanvasSelectionState\(\)\)/,
    "外部 modelValue 回灌时仍在直接清空 selection",
  );
});
