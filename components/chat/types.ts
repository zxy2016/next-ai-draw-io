export interface DiagramOperation {
    operation: "update" | "add" | "delete"
    cell_id: string
    new_xml?: string
}

/**
 * Server-side execute 工具(如 propose_swimlane_ir)的结构化输出。
 * 与 lib/swimlane/handler.ts 的 ProposeSwimlaneIrResult 保持同步。
 *
 * 注意:这里 ir 用 unknown,因为客户端不应该信任 messages stream 里的对象
 * 一定符合 SwimlaneIR schema(可能从老历史 / 不同版本来)。前端拿到 ir 后
 * 在 IREditor 等真正用它前要重新 SwimlaneIR.safeParse() 一次。
 */
export interface SwimlaneIrToolOutput {
    xml: string
    title: string
    ir: unknown
    stats: {
        roles: number
        phases: number
        nodes: number
        edges: number
        rules: number
    }
}

export interface ToolPartLike {
    type: string
    toolCallId: string
    state?: string
    input?: {
        xml?: string
        operations?: DiagramOperation[]
    } & Record<string, unknown>
    /**
     * 工具输出。
     * - 客户端工具(display_diagram/edit_diagram/append_diagram):字符串(errorText 或空)
     * - 服务端 execute 工具(propose_swimlane_ir):结构化对象
     */
    output?: string | SwimlaneIrToolOutput | Record<string, unknown>
}
