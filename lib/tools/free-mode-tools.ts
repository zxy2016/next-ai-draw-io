import "server-only"
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"

/**
 * 通用 free mode 工具集（hdraw 默认模式）。
 *
 * 设计原则:
 * - 工具 schema + description + execute 集中此处,避免散落在 route.ts
 * - get_shape_library 用了 fs/path,故整个模块 server-only
 * - 返回 plain object 而非函数,保留 Vercel AI SDK 的类型推导
 */

const SHAPE_LIBRARY_BASE_DIR = "docs/shape-libraries"

/**
 * 列出可用的 shape library 名称(供错误提示)。
 * 与 docs/shape-libraries/ 下的 .md 文件名一一对应。
 */
const AVAILABLE_SHAPE_LIBRARIES = [
    "aws4",
    "azure2",
    "gcp2",
    "alibaba_cloud",
    "cisco19",
    "kubernetes",
    "network",
    "bpmn",
    "flowchart",
    "basic",
    "arrows2",
    "vvd",
    "salesforce",
    "citrix",
    "sap",
    "mscae",
    "atlassian",
    "fluidpower",
    "electrical",
    "pid",
    "cabinets",
    "floorplan",
    "webicons",
    "infographic",
    "sitemap",
    "android",
    "material_design",
    "lean_mapping",
    "openstack",
    "rack",
] as const

/**
 * 加载 shape library markdown,返回内容字符串。
 * 包含路径遍历防御。
 */
async function loadShapeLibrary(library: string): Promise<string> {
    // 输入清洗:只允许字母数字下划线短横线,防止路径遍历
    const sanitizedLibrary = library.toLowerCase().replace(/[^a-z0-9_-]/g, "")

    if (sanitizedLibrary !== library.toLowerCase()) {
        return `Invalid library name "${library}". Use only letters, numbers, underscores, and hyphens.`
    }

    const baseDir = path.join(process.cwd(), SHAPE_LIBRARY_BASE_DIR)
    const filePath = path.join(baseDir, `${sanitizedLibrary}.md`)

    // 解析后的绝对路径必须仍在 baseDir 内,杜绝 ../../ 逃逸
    const resolvedPath = path.resolve(filePath)
    if (!resolvedPath.startsWith(path.resolve(baseDir))) {
        return `Invalid library path.`
    }

    try {
        return await fs.readFile(filePath, "utf-8")
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return `Library "${library}" not found. Available: ${AVAILABLE_SHAPE_LIBRARIES.join(", ")}`
        }
        console.error(`[get_shape_library] Error loading "${library}":`, error)
        return `Error loading library "${library}". Please try again.`
    }
}

/**
 * 返回 free mode 全部工具配置(给 streamText.tools 用)。
 *
 * 工具语义分工:
 *   - display_diagram   全量重画(客户端执行)
 *   - edit_diagram      按 id 增量操作(客户端执行)
 *   - append_diagram    截断续传(客户端执行)
 *   - get_shape_library 服务端读取 shape 库文档(本地 execute)
 */
export function getFreeModeTools() {
    return {
        // 客户端工具:server 只声明 schema,实际渲染由前端 onToolCall 处理
        display_diagram: {
            description: `Display a diagram on draw.io. Pass ONLY the mxCell elements - wrapper tags and root cells are added automatically.

VALIDATION RULES (XML will be rejected if violated):
1. Generate ONLY mxCell elements - NO wrapper tags (<mxfile>, <mxGraphModel>, <root>)
2. Do NOT include root cells (id="0" or id="1") - they are added automatically
3. All mxCell elements must be siblings - never nested
4. Every mxCell needs a unique id (start from "2")
5. Every mxCell needs a valid parent attribute (use "1" for top-level)
6. Escape special chars in values: &lt; &gt; &amp; &quot;

Example (generate ONLY this - no wrapper tags):
<mxCell id="lane1" value="Frontend" style="swimlane;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="200" height="200" as="geometry"/>
</mxCell>
<mxCell id="step1" value="Step 1" style="rounded=1;" vertex="1" parent="lane1">
  <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
</mxCell>
<mxCell id="lane2" value="Backend" style="swimlane;" vertex="1" parent="1">
  <mxGeometry x="280" y="40" width="200" height="200" as="geometry"/>
</mxCell>
<mxCell id="step2" value="Step 2" style="rounded=1;" vertex="1" parent="lane2">
  <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
</mxCell>
<mxCell id="edge1" style="edgeStyle=orthogonalEdgeStyle;endArrow=classic;" edge="1" parent="1" source="step1" target="step2">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>

Notes:
- For AWS diagrams, use **AWS 2025 icons**.
- For animated connectors, add "flowAnimation=1" to edge style.
`,
            inputSchema: z.object({
                xml: z
                    .string()
                    .describe("XML string to be displayed on draw.io"),
            }),
        },
        edit_diagram: {
            description: `Edit the current diagram by ID-based operations (update/add/delete cells).

Operations:
- update: Replace an existing cell by its id. Provide cell_id and complete new_xml.
- add: Add a new cell. Provide cell_id (new unique id) and new_xml.
- delete: Remove a cell. Cascade is automatic: children AND edges (source/target) are auto-deleted. Only specify ONE cell_id.

For update/add, new_xml must be a complete mxCell element including mxGeometry.

⚠️ JSON ESCAPING: Every " inside new_xml MUST be escaped as \\". Example: id=\\"5\\" value=\\"Label\\"

Example - Add a rectangle:
{"operations": [{"operation": "add", "cell_id": "rect-1", "new_xml": "<mxCell id=\\"rect-1\\" value=\\"Hello\\" style=\\"rounded=0;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"100\\" y=\\"100\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}]}

Example - Delete container (children & edges auto-deleted):
{"operations": [{"operation": "delete", "cell_id": "2"}]}`,
            inputSchema: z.object({
                operations: z
                    .array(
                        z.object({
                            operation: z
                                .enum(["update", "add", "delete"])
                                .describe(
                                    "Operation to perform: add, update, or delete",
                                ),
                            cell_id: z
                                .string()
                                .describe(
                                    "The id of the mxCell. Must match the id attribute in new_xml.",
                                ),
                            new_xml: z
                                .string()
                                .optional()
                                .describe(
                                    "Complete mxCell XML element (required for update/add)",
                                ),
                        }),
                    )
                    .describe("Array of operations to apply"),
            }),
        },
        append_diagram: {
            description: `Continue generating diagram XML when previous display_diagram output was truncated due to length limits.

WHEN TO USE: Only call this tool after display_diagram was truncated (you'll see an error message about truncation).

CRITICAL INSTRUCTIONS:
1. Do NOT include any wrapper tags - just continue the mxCell elements
2. Continue from EXACTLY where your previous output stopped
3. Complete the remaining mxCell elements
4. If still truncated, call append_diagram again with the next fragment

Example: If previous output ended with '<mxCell id="x" style="rounded=1', continue with ';" vertex="1">...' and complete the remaining elements.`,
            inputSchema: z.object({
                xml: z
                    .string()
                    .describe(
                        "Continuation XML fragment to append (NO wrapper tags)",
                    ),
            }),
        },
        get_shape_library: {
            description: `Get draw.io shape/icon library documentation with style syntax and shape names.

Available libraries:
- Cloud: aws4, azure2, gcp2, alibaba_cloud, openstack, salesforce
- Networking: cisco19, network, kubernetes, vvd, rack
- Business: bpmn, lean_mapping
- General: flowchart, basic, arrows2, infographic, sitemap
- UI/Mockups: android, material_design
- Enterprise: citrix, sap, mscae, atlassian
- Engineering: fluidpower, electrical, pid, cabinets, floorplan
- Icons: webicons

Call this tool to get shape names and usage syntax for a specific library.`,
            inputSchema: z.object({
                library: z
                    .string()
                    .describe(
                        "Library name (e.g., 'aws4', 'kubernetes', 'flowchart')",
                    ),
            }),
            execute: async ({ library }: { library: string }) => {
                return loadShapeLibrary(library)
            },
        },
        suggest_replies: {
            description: `Generate quick-reply suggestions for the user when asking a question.
This tool should be used alongside a text response when you want to provide clickable button options for the user to quickly reply.

CRITICAL INSTRUCTION:
You MUST provide 2-4 distinct, realistic user responses based on the question you just asked.

Example: If you ask "Do you want to add a database layer?", you might suggest:
{"suggestions": ["Yes, add PostgreSQL", "No, keep it frontend only", "Yes, but use MongoDB instead"]}`,
            inputSchema: z.object({
                suggestions: z
                    .array(z.string())
                    .describe(
                        "Array of 2-4 suggested reply strings for the user",
                    ),
            }),
        },
    }
}
