import "server-only"
import { z } from "zod"
import { handleProposeSwimlaneIr } from "@/lib/swimlane/handler"

/**
 * Swimlane mode 工具集。
 *
 * 设计要点:
 * - 当前只暴露 propose_swimlane_ir 一个工具(YAGNI:ask_user 用普通文本追问即可)
 * - execute 在服务端调 IR Zod 校验 + irToXml,把 XML 作为 tool-result 返回
 * - 校验失败 throw,AI SDK 自动把错误作为 is_error tool-result 回流给模型,
 *   触发下一步自我修复(等价于 flow 项目的 self-healing loop)
 * - 注意:不暴露 display_diagram / edit_diagram / append_diagram,模型在 swimlane
 *   mode 下唯一的图形输出通道就是 propose_swimlane_ir
 */

/**
 * IR 输入 schema(给 AI SDK 用),与 lib/swimlane/ir/schema.ts 保持业务上等价。
 *
 * 为什么不直接 reuse 那边的 SwimlaneIR?
 * - AI SDK 把工具 inputSchema 转成 JSON Schema 喂给 LLM,带 .refine() 的复合校验
 *   无法表达在 JSON Schema 中(LLM 看不到 refine 规则)
 * - 这里用一份"语法可见"的 schema 让 LLM 知道字段形状,执行时再用 lib/swimlane/ir
 *   的 schema 跑完整 refine 校验(包括 start 唯一、引用完整性等)
 * - 双 schema 不冗余:一份给 LLM 看格式,一份给运行时把关业务规则
 */
const NodeTypeEnum = z.enum([
    "start",
    "end",
    "task",
    "decision",
    "subprocess",
    "data",
    "document",
    "manual",
    "system",
])

const EdgeStyleEnum = z.enum(["solid", "dashed", "thick"])

const swimlaneIrInputSchema = z.object({
    title: z.string().describe("流程名称,如「采购审批流程」"),
    description: z.string().optional().describe("可选,流程一句话简介"),
    roles: z
        .array(
            z.object({
                id: z
                    .string()
                    .regex(/^r\d+$/)
                    .describe("形如 r1/r2,按出现顺序连续编号"),
                name: z.string().describe("角色名,≤20 字"),
                description: z.string().optional(),
            }),
        )
        .describe("纵轴:角色 / 部门 / 岗位 / 系统,1-10 个"),
    phases: z
        .array(
            z.object({
                id: z
                    .string()
                    .regex(/^p\d+$/)
                    .describe("形如 p1/p2"),
                name: z.string().describe("阶段名,≤20 字"),
                description: z.string().optional(),
            }),
        )
        .describe("横轴:流程阶段 / 系统域,1-10 个"),
    nodes: z
        .array(
            z.object({
                id: z
                    .string()
                    .regex(/^n\d+$/)
                    .describe("形如 n1/n2"),
                roleId: z.string().regex(/^r\d+$/),
                phaseId: z.string().regex(/^p\d+$/),
                type: NodeTypeEnum,
                label: z.string().describe("节点文字,≤30 字"),
                order: z
                    .number()
                    .int()
                    .min(0)
                    .describe("同一(role,phase)单元格内横向排列顺序,从 0 开始"),
            }),
        )
        .describe("流程节点:必须放在「执行角色行 × 所属阶段列」的交叉单元格里"),
    edges: z
        .array(
            z.object({
                id: z
                    .string()
                    .regex(/^e\d+$/)
                    .describe("形如 e1/e2"),
                from: z.string().regex(/^n\d+$/),
                to: z.string().regex(/^n\d+$/),
                label: z.string().optional().describe("边上文字,≤20 字"),
                style: EdgeStyleEnum.optional().describe(
                    "solid=主流程, dashed=异步/通知, thick=关键路径",
                ),
            }),
        )
        .describe("连线:决策节点必须有 ≥2 条出边"),
    rules: z
        .array(z.string())
        .optional()
        .describe(
            "业务规则数组(如「单笔超 10w 必须 CFO 复核」),渲染到图例下方;不存在硬约束时省略或传空数组",
        ),
})

/**
 * 返回 swimlane mode 全部工具配置(给 streamText.tools 用)。
 */
export function getSwimlaneModeTools() {
    return {
        propose_swimlane_ir: {
            description: `生成或更新二维矩阵泳道图。这是 swimlane 模式下唯一的图形输出通道。

使用时机:
- 已经从对话中收集到角色(roles)、阶段(phases)、节点(nodes)、连线(edges)四类信息
- 用户描述清晰、信息齐全,可以一次性给出完整 IR

二维矩阵约束:
- 纵轴 = 角色行,横轴 = 阶段列
- 每个 node 必须放在「该 node 的执行角色行 × 所属阶段列」的交叉单元格里
- 跨行箭头 = 跨角色协作,跨列箭头 = 流程推进/阶段切换,同格箭头 = 局部循环

强制业务规则(违反会触发服务端校验失败并要求你重试):
1. roles/phases/nodes/edges 的 id 必须分别形如 r1/p1/n1/e1,按出现顺序连续编号
2. 所有 id 全局唯一(roles/phases/nodes/edges 之间也不能撞)
3. 必须有且仅有一个 start 节点,至少一个 end 节点
4. edges 的 from/to 必须引用已定义的 node
5. nodes 的 roleId/phaseId 必须引用已定义的 role/phase

业务规则字段(rules):
- 把对话中提到的金额阈值/合规/必经步骤等硬约束,每条一句话写进 rules 数组
- 不要写"start 必须唯一"这类结构常识(系统会自动校验)
- 无任何业务规则时传 [] 或省略`,
            inputSchema: swimlaneIrInputSchema,
            execute: async (input: z.infer<typeof swimlaneIrInputSchema>) => {
                // handler 内做完整 Zod refine 校验 + irToXml
                // 失败抛 SwimlaneIrValidationError,AI SDK 转成 is_error tool-result 回流
                return handleProposeSwimlaneIr(input)
            },
        },
    }
}
