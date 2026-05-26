import { z } from "zod"

/**
 * 节点类型枚举,对应 drawio 9 种常用形状。
 * 选型原则:覆盖 BPMN/泳道图主流语义,且每种在 drawio 都有稳定 stencil。
 */
export const NodeType = z.enum([
    "start", // 椭圆,流程起点
    "end", // 椭圆,流程终点
    "task", // 圆角矩形,普通任务
    "decision", // 菱形,判断分支
    "subprocess", // 双线圆角矩形,子流程
    "data", // 平行四边形,数据
    "document", // 文档形,产物
    "manual", // 梯形,人工操作
    "system", // 直角矩形,系统自动操作
])
export type NodeType = z.infer<typeof NodeType>

/**
 * 边样式:覆盖主流程/异步/关键路径三种语义。
 */
export const EdgeStyle = z.enum(["solid", "dashed", "thick"])
export type EdgeStyle = z.infer<typeof EdgeStyle>

export const RoleSchema = z.object({
    id: z.string().regex(/^r\d+$/, "Role id 必须形如 r1/r2..."),
    name: z.string().min(1).max(20),
    description: z.string().max(100).optional(),
})
export type Role = z.infer<typeof RoleSchema>

export const PhaseSchema = z.object({
    id: z.string().regex(/^p\d+$/, "Phase id 必须形如 p1/p2..."),
    name: z.string().min(1).max(20),
    description: z.string().max(100).optional(),
})
export type Phase = z.infer<typeof PhaseSchema>

export const NodeSchema = z.object({
    id: z.string().regex(/^n\d+$/, "Node id 必须形如 n1/n2..."),
    roleId: z.string().regex(/^r\d+$/),
    phaseId: z.string().regex(/^p\d+$/),
    type: NodeType,
    label: z.string().min(1).max(30),
    /** 同一(role, phase)单元格内的横向排列顺序,从 0 开始 */
    order: z.number().int().min(0).default(0),
})
export type Node = z.infer<typeof NodeSchema>

export const EdgeSchema = z.object({
    id: z.string().regex(/^e\d+$/, "Edge id 必须形如 e1/e2..."),
    from: z.string().regex(/^n\d+$/),
    to: z.string().regex(/^n\d+$/),
    label: z.string().max(20).optional(),
    style: EdgeStyle.default("solid"),
})
export type Edge = z.infer<typeof EdgeSchema>

/**
 * 核心 IR:整张二维矩阵泳道图的结构化表示。
 * Agent 通过 propose_ir tool 输出此结构,代码再生成 XML。
 */
export const SwimlaneIR = z
    .object({
        title: z.string().min(1).max(50),
        description: z.string().max(200).optional(),
        roles: z.array(RoleSchema).min(1).max(10),
        phases: z.array(PhaseSchema).min(1).max(10),
        nodes: z.array(NodeSchema).min(1).max(50),
        edges: z.array(EdgeSchema),
        /**
         * 业务侧关键规则/约束/合规要求(非结构性说明),由 LLM 从用户描述中提取。
         * 例如:"验真不通过的发票不得进入三单匹配"、"金额超 10w 必须财务总监复核"。
         * 渲染到图例下方,空时不渲染。
         */
        rules: z.array(z.string().min(1).max(120)).max(8).optional(),
    })
    // 业务规则 1: 节点必须引用已存在的 role/phase
    .refine(
        (ir) => {
            const roleIds = new Set(ir.roles.map((r) => r.id))
            const phaseIds = new Set(ir.phases.map((p) => p.id))
            return ir.nodes.every(
                (n) => roleIds.has(n.roleId) && phaseIds.has(n.phaseId),
            )
        },
        { message: "存在节点引用了不存在的 role 或 phase" },
    )
    // 业务规则 2: 边必须引用已存在的 node
    .refine(
        (ir) => {
            const nodeIds = new Set(ir.nodes.map((n) => n.id))
            return ir.edges.every(
                (e) => nodeIds.has(e.from) && nodeIds.has(e.to),
            )
        },
        { message: "存在连线引用了不存在的 node" },
    )
    // 业务规则 3: 必须有且仅有一个 start 节点
    .refine((ir) => ir.nodes.filter((n) => n.type === "start").length === 1, {
        message: "必须有且仅有一个 start 节点",
    })
    // 业务规则 4: 至少一个 end 节点
    .refine((ir) => ir.nodes.some((n) => n.type === "end"), {
        message: "必须至少有一个 end 节点",
    })
    // 业务规则 5: id 唯一性
    .refine(
        (ir) => {
            const ids = [
                ...ir.roles.map((r) => r.id),
                ...ir.phases.map((p) => p.id),
                ...ir.nodes.map((n) => n.id),
                ...ir.edges.map((e) => e.id),
            ]
            return new Set(ids).size === ids.length
        },
        { message: "存在重复的 id" },
    )

export type SwimlaneIR = z.infer<typeof SwimlaneIR>
