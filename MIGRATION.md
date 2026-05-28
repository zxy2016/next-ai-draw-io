# Migration Log

记录从 `flow` 项目融合到 `hdraw` 的所有改动。

**目的**：

1. 让上游 (`upstream/main` = DayuanJiang/hdraw) 同步时能快速识别冲突域
2. 让后续维护者一眼看清"哪些是我们加的、哪些来自上游"
3. 给可能的反向贡献（推回上游）保留清晰边界

## 设计原则

- **新代码集中在 `lib/swimlane/` 命名空间**，最小化对现有文件的侵入
- **上游已有文件的改动控制在"模式分支判断"层面**，不重写核心逻辑
- **Free mode（通用 draw.io）的行为完全保留**，用户随时可切回
- **默认模式为 swimlane**（本 fork 主要面向同事画泳道图场景）；用户首次进入即在 swimlane mode，可以通过 header 工具栏的 Workflow 按钮切换

## 改动清单

### 新增目录

| 路径 | 说明 |
|---|---|
| `lib/swimlane/ir/` | IR Zod schema + 业务规则 refine |
| `lib/swimlane/xml/` | IR → drawio XML 引擎（layout/styles/engine/validator） |
| `lib/swimlane/streaming/` | 流式工具兜底（ThinkTagSplitter、JsonStringFieldStreamer） |
| `lib/tools/` | 集中式工具定义（抽自 route.ts） |
| `tests/unit/swimlane/` | IR + XML 引擎单测 |

### 修改的上游文件（merge 时重点关注）

| 文件 | 改动性质 | 说明 |
|---|---|---|
| `app/api/chat/route.ts` | 工具定义抽出 + mode 分支 | 工具定义集中到 `lib/tools/defs.ts`，按 `x-flow-mode` header 切换工具集 |
| `lib/system-prompts.ts` | 增加 swimlane 分支 | 新增 `getSwimlaneSystemPrompt()`，free mode 行为不变 |
| `components/chat-panel.tsx` | 新增 mode toggle | localStorage 持久化模式选择 |
| `hooks/use-diagram-tool-handlers.ts` | 增加 propose_swimlane_ir 分支 | 复用 onDisplayChart 渲染 |
| `package.json` | 新增依赖 | `xmlbuilder2` |

### 新增依赖

| 包 | 用途 |
|---|---|
| `xmlbuilder2` | IR → XML 序列化 |

## 与上游同步流程

```bash
git fetch upstream
git merge upstream/main          # 或 rebase

# 冲突大概率在：
# - app/api/chat/route.ts（工具定义区域）
# - lib/system-prompts.ts
# - components/chat-panel.tsx

# lib/swimlane/* 是我们独占的，不会冲突
```

## 各 Phase 改动追溯

| Phase | 主要变更 | 提交标记 |
|---|---|---|
| Phase 0 | 分支 + 目录 + 本文档 | `chore(swimlane): scaffold` |
| Phase 1 | IR Schema + XML 引擎搬迁 | `feat(swimlane): port IR + XML engine from flow` |
| Phase 2 | 工具定义抽取 | `refactor(tools): centralize tool defs` |
| Phase 3 | Swimlane mode | `feat(swimlane): wire swimlane mode` |
| Phase 4 | Prompt 拆分 | `feat(swimlane): dedicated system prompt` |
| Phase 5-7 | 自愈/视觉/流式 | `feat(swimlane): robustness layers` |
| Phase 8 | 文档与回归 | `docs(swimlane): update README` |
