import "server-only"
import type { SwimlaneIR as SwimlaneIRType } from "@/lib/swimlane/ir/schema"
import { SwimlaneIR } from "@/lib/swimlane/ir/schema"
import { irToXml } from "@/lib/swimlane/xml/engine"
import { validateDrawioXml } from "@/lib/swimlane/xml/validator"

/**
 * Swimlane 工具调用的服务端执行器。
 *
 * 核心职责:
 * 1. Zod 业务规则校验(start 唯一、id 唯一、引用完整性等)
 * 2. 调用 irToXml() 生成确定性 XML
 * 3. drawio XML 合规性后置校验
 *
 * 失败语义:
 * - 校验失败抛 SwimlaneIrValidationError,AI SDK 会把 error.message 作为
 *   tool-result(is_error=true)回流给模型,触发下一轮自我修复
 * - 这正是 flow 的 self-healing loop 在 AI SDK 6 上的等价物
 */

export class SwimlaneIrValidationError extends Error {
    readonly issues: string[]

    constructor(issues: string[]) {
        const message = `IR 校验失败,请修正后重新调用 propose_swimlane_ir。错误:\n${issues.join("\n")}`
        super(message)
        this.name = "SwimlaneIrValidationError"
        this.issues = issues
    }
}

export interface ProposeSwimlaneIrResult {
    /** drawio mxGraphModel XML,已通过 validator 校验 */
    xml: string
    /** 简短的图标题,可用于前端展示 */
    title: string
    /**
     * 已通过 Zod 业务规则校验的 IR 对象。
     * 前端 IREditor 抽屉编辑用,也用于多轮对话时把"最新版"IR 重新喂回模型。
     */
    ir: SwimlaneIRType
    /** 节点/边/角色/阶段的简单统计 */
    stats: {
        roles: number
        phases: number
        nodes: number
        edges: number
        rules: number
    }
}

/**
 * 处理 propose_swimlane_ir 工具调用。
 *
 * @param input  模型给出的 IR 对象(未校验)
 * @returns      含 XML 的结果对象,前端拿到后直接渲染
 * @throws       SwimlaneIrValidationError 当 Zod 业务规则或 XML 校验失败
 */
export function handleProposeSwimlaneIr(
    input: unknown,
): ProposeSwimlaneIrResult {
    // === 阶段 1: IR Zod 校验(包含 5 条业务 refine 规则) ===
    const parsed = SwimlaneIR.safeParse(input)
    if (!parsed.success) {
        const issues = parsed.error.issues.map(
            (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
        )
        throw new SwimlaneIrValidationError(issues)
    }

    const ir = parsed.data

    // === 阶段 2: IR → drawio XML(纯函数,坐标确定性计算) ===
    const xml = irToXml(ir)

    // === 阶段 3: 生成的 XML 后置校验(防御性,正常情况下应永远通过) ===
    const xmlCheck = validateDrawioXml(xml)
    if (!xmlCheck.valid) {
        throw new SwimlaneIrValidationError([
            `XML 后置校验失败(引擎 bug,请联系开发者): ${xmlCheck.errors.join("; ")}`,
        ])
    }

    return {
        xml,
        title: ir.title,
        ir,
        stats: {
            roles: ir.roles.length,
            phases: ir.phases.length,
            nodes: ir.nodes.length,
            edges: ir.edges.length,
            rules: ir.rules?.length ?? 0,
        },
    }
}
