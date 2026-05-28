# HDraw Project Rules & Context

本文件定义了 HDraw 项目的技术架构、目录结构、开发工作流以及 AI 协同开发规范。AI 助手在每次启动会话时应自动读取本文件以遵循项目的技术约束和开发规范。

---

## 1. 项目概述

`hdraw` 是一个集成了大语言模型（LLM）与 draw.io 的 AI 绘图平台项目。它允许用户使用自然语言、图片或上传的文档（PDF/文本）来生成、修改和优化复杂的图表。
项目支持多模型供应商，支持以 Next.js Web 应用程序运行、桌面端客户端（Electron）运行、Docker 镜像运行，并可快速部署至 Cloudflare Workers/Pages、Vercel 及 Tencent EdgeOne。

---

## 2. 核心技术栈

* **Web 框架**: Next.js 16.x (App Router, Turbopack) & React 19.x
* **AI 交互与流式支持**: Vercel AI SDK (`ai` 与 `@ai-sdk/*`)
* **画图能力**: `react-drawio` (集成画图渲染器)
* **桌面端应用**: Electron 39.x & `electron-builder`
* **代码格式与校验**: Biome (集成了 Linter 和 Formatter)
* **测试框架**: Vitest (单元测试), Playwright (E2E 测试)
* **部署/构建依赖**: `@opennextjs/cloudflare` & `wrangler`
* **UI 组件与样式**: Radix UI, Tailwind CSS v4, `lucide-react`, `motion`

---

## 3. 项目目录结构

```text
hdraw/
├── app/                      # Next.js 16 App Router
│   ├── [lang]/               # 支持多语言路由的页面 (如主页 page.tsx 和布局 layout.tsx)
│   ├── api/                  # API 端点 (chat, config, parse-url 等)
│   ├── globals.css           # 全局样式文件
│   └── favicon.ico / robots  # 基础元数据配置
├── components/               # React 业务组件与通用 UI 组件
├── contexts/                 # 全局 React Contexts (如状态管理器)
├── hooks/                    # 自定义 React Hooks
├── lib/                      # 基础工具类与底层接口封装
├── electron/                 # Electron 桌面端主进程与预加载脚本
│   ├── main/
│   └── preload/
├── packages/                 # Monorepo 子包
│   ├── mcp-server/           # Model Context Protocol (MCP) 服务端代码
│   └── claude-plugin/        # Claude 插件相关代码
├── tests/                    # 测试用例目录 (Vitest / Playwright)
├── docs/                     # 中/英/日多语言文档目录
├── biome.json                # Biome 校验与格式化配置文件
├── wrangler.jsonc            # Cloudflare Wrangler 配置文件
└── package.json              # 项目依赖与构建指令
```

---

## 4. 关键开发指令

* **本地开发 (Web)**: `npm run dev` (默认运行在 http://localhost:6002)
* **打包构建 (Web)**: `npm run build`
* **运行单元测试**: `npm run test` (使用 Vitest 驱动)
* **运行端到端测试**: `npm run test:e2e` (使用 Playwright 驱动)
* **代码检查与修复**:
  * 检查: `npm run lint` (Biome 校验)
  * 格式化并修复: `npm run format` (Biome 格式化与自动修复)
* **桌面端开发 (Electron)**:
  * 运行开发环境: `npm run electron:dev`
  * 打包 macOS 版: `npm run dist:mac`
  * 打包 Windows 版: `npm run dist:win`
* **Cloudflare 预览/部署**:
  * 预览: `npm run preview`
  * 部署: `npm run deploy`

---

## 5. AI 开发协同规范与全局约束

为保持代码质量与项目的一致性，AI 助手在此项目中必须严格遵守以下准则：

### 5.1 语言与注释规范
* **默认语言**: 所有回答和代码注释必须**默认使用简体中文**。
* **注释要求**: 注释应清晰易懂，对于复杂的算法、Next.js Server Actions 或 Electron IPC 通信，必须配以详尽的中文注释。

### 5.2 质量与测试要求 (CRITICAL)
* **单元测试强制性**: **本项目的所有开发和修改，都必须编写对应的单元测试**。
  * 单元测试必须基于 **Vitest** 框架编写。
  * 测试文件通常放在 `tests/` 目录或与被测试模块相邻。
  * 在交付代码前，必须执行 `npm run test` 以确保所有单元测试能够顺利通过。

### 5.3 代码风格与质量
* **Biome 优先**: 本项目使用 **Biome** 作为代码格式化和检查工具。禁止引入或配置 ESLint、Prettier。
* **类型安全**: 严格使用 TypeScript，除极其特殊情况外禁止使用 `any` 类型。
* **文档完整性**: 修改已有代码时，除非用户明确要求，否则**必须保留**所有与修改无关的原有注释、JSDoc 和文档说明。

### 5.4 Git 提交格式规范
所有的 Git 提交消息（Commit Message）必须严格遵循以下格式：

```text
类型: [feat/fix/docs/style/refactor/test/build/chore]
描述: [简洁说明修改内容，不超过50字]
详细说明: [可选，复杂修改需补充]
关联Issue: [可选，如#123]
```

**要求**：
1. 根据代码实际改动，自动并准确地判断合适的类型（如新功能选 `feat`，修 bug 选 `fix`，写测试选 `test`，调整配置选 `chore` 等）。
2. 描述（描述一行）需要清晰具体，字数控制在 50 字以内。
3. 如果只是简单改动，可以省略“详细说明”部分。
4. 若无关联 Issue，则省略“关联Issue”字段。
