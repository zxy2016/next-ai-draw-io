import type { Node, SwimlaneIR } from "@/lib/swimlane/ir/schema"

/**
 * 布局常量,所有尺寸单位为 drawio 像素。
 * 可在 P4 阶段做成用户可配置项。
 */
export const LAYOUT = {
    ORIGIN_X: 40,
    ORIGIN_Y: 40,
    CORNER_W: 140, // 左上角占位格宽
    HEADER_H: 40, // 顶部列表头高
    ROW_LABEL_W: 140, // 左侧行表头宽
    ROW_MIN_H: 120, // 行最小高度
    COL_MIN_W: 240, // 列最小宽度
    NODE_W: 100,
    NODE_H: 40,
    NODE_GAP: 20, // 同格内节点间距

    // === 图例区(矩阵下方) ===
    LEGEND_TOP_GAP: 50, // 矩阵底到图例顶的间距
    LEGEND_NODE_SAMPLE_W: 40, // 节点形状样本宽
    LEGEND_NODE_SAMPLE_H: 22, // 节点形状样本高
    LEGEND_NODE_LABEL_W: 78, // 节点图例文字宽
    LEGEND_NODE_ITEM_W: 130, // 节点图例每项总宽(样本 + 间距 + 文字)
    LEGEND_NODE_ROW_H: 30, // 节点图例行高
    LEGEND_EDGE_LINE_LEN: 60, // 边样本线段长度
    LEGEND_EDGE_LABEL_W: 100, // 边图例文字宽
    LEGEND_EDGE_ITEM_W: 180, // 边图例每项总宽
    LEGEND_EDGE_ROW_H: 28, // 边图例行高
    LEGEND_SECTION_GAP: 10, // 节点/边/规则三段间空隙
    LEGEND_RULE_LINE_H: 20, // 规则单行高
    LEGEND_RULE_LINES: 3, // 规则行数(用于高度预算)
    LEGEND_BOTTOM_PAD: 30, // 图例底部留白(外框下方到画布底)
    LEGEND_FRAME_PAD: 14, // 外框内边距(框线到内容)
} as const

/**
 * 计算某一列的宽度。
 * 策略:取该列在所有 role 中节点数最多的那格,按节点数 + 间隙撑开,
 * 至少不小于 COL_MIN_W。
 */
export function computeColWidth(ir: SwimlaneIR, phaseId: string): number {
    const maxInCell = Math.max(
        1,
        ...ir.roles.map(
            (r) =>
                ir.nodes.filter(
                    (n) => n.roleId === r.id && n.phaseId === phaseId,
                ).length,
        ),
    )
    const need = maxInCell * LAYOUT.NODE_W + (maxInCell + 1) * LAYOUT.NODE_GAP
    return Math.max(LAYOUT.COL_MIN_W, need)
}

/**
 * 返回(role, phase)单元格的左上角坐标。
 */
export function getCellOrigin(
    ir: SwimlaneIR,
    roleId: string,
    phaseId: string,
): { x: number; y: number } {
    const ri = ir.roles.findIndex((r) => r.id === roleId)
    const pi = ir.phases.findIndex((p) => p.id === phaseId)
    if (ri < 0 || pi < 0)
        throw new Error(`未知 roleId/phaseId: ${roleId}/${phaseId}`)

    const x =
        LAYOUT.ORIGIN_X +
        LAYOUT.ROW_LABEL_W +
        ir.phases
            .slice(0, pi)
            .reduce((sum, p) => sum + computeColWidth(ir, p.id), 0)
    const y = LAYOUT.ORIGIN_Y + LAYOUT.HEADER_H + ri * LAYOUT.ROW_MIN_H
    return { x, y }
}

/**
 * 计算节点的最终绘制坐标。
 * 同格内多节点按 order 升序,横向居中排列。
 */
export function getNodePosition(
    ir: SwimlaneIR,
    node: Node,
): { x: number; y: number; w: number; h: number } {
    const { x: cellX, y: cellY } = getCellOrigin(ir, node.roleId, node.phaseId)
    const colW = computeColWidth(ir, node.phaseId)

    const siblings = ir.nodes
        .filter((n) => n.roleId === node.roleId && n.phaseId === node.phaseId)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    const idx = siblings.findIndex((n) => n.id === node.id)

    const totalW =
        siblings.length * LAYOUT.NODE_W +
        (siblings.length - 1) * LAYOUT.NODE_GAP
    const startX = cellX + (colW - totalW) / 2

    return {
        x: startX + idx * (LAYOUT.NODE_W + LAYOUT.NODE_GAP),
        y: cellY + (LAYOUT.ROW_MIN_H - LAYOUT.NODE_H) / 2,
        w: LAYOUT.NODE_W,
        h: LAYOUT.NODE_H,
    }
}

/**
 * 矩阵主体的底边 Y 坐标(图例从这里往下排)。
 */
export function getMatrixBottomY(ir: SwimlaneIR): number {
    return (
        LAYOUT.ORIGIN_Y + LAYOUT.HEADER_H + ir.roles.length * LAYOUT.ROW_MIN_H
    )
}

/**
 * 节点图例每行显示个数。
 */
const LEGEND_NODE_PER_ROW = 5

/**
 * 图例三段内容的总高度(不含外框 padding,不含上下 gap)。
 */
export function computeLegendInnerHeight(ir: SwimlaneIR): number {
    const usedNodeTypes = new Set(ir.nodes.map((n) => n.type))
    const usedEdgeStyles = new Set(ir.edges.map((e) => e.style ?? "solid"))
    const ruleCount = ir.rules?.length ?? 0

    const nodeRows =
        usedNodeTypes.size === 0
            ? 0
            : Math.ceil(usedNodeTypes.size / LEGEND_NODE_PER_ROW)
    const edgeRow = usedEdgeStyles.size > 0 ? 1 : 0

    let inner = 0
    if (nodeRows > 0) inner += LAYOUT.LEGEND_NODE_ROW_H * nodeRows
    if (edgeRow) {
        if (nodeRows > 0) inner += LAYOUT.LEGEND_SECTION_GAP
        inner += LAYOUT.LEGEND_EDGE_ROW_H
    }
    if (ruleCount > 0) {
        if (nodeRows > 0 || edgeRow) inner += LAYOUT.LEGEND_SECTION_GAP
        inner += LAYOUT.LEGEND_RULE_LINE_H * ruleCount
    }
    return inner
}

/**
 * 图例区在画布上占用的总高度。
 *   = 上方 gap(矩阵到框顶) + 外框上下 padding + 内部内容 + 下方 gap
 *
 * 三段内容均空时(node 永远 >=1,所以现实中不会触发)返回 0。
 */
export function computeLegendHeight(ir: SwimlaneIR): number {
    const inner = computeLegendInnerHeight(ir)
    if (inner === 0) return 0
    return (
        LAYOUT.LEGEND_TOP_GAP +
        LAYOUT.LEGEND_FRAME_PAD * 2 +
        inner +
        LAYOUT.LEGEND_BOTTOM_PAD
    )
}

/**
 * 返回 IR 中实际出现过的 node type / edge style 列表,
 * 顺序按 NodeType/EdgeStyle 的 schema 定义顺序(稳定且符合阅读直觉)。
 */
export function getUsedNodeTypes(ir: SwimlaneIR): readonly string[] {
    const used = new Set(ir.nodes.map((n) => n.type))
    const ORDER = [
        "start",
        "end",
        "task",
        "decision",
        "subprocess",
        "data",
        "document",
        "manual",
        "system",
    ] as const
    return ORDER.filter((t) => used.has(t))
}

export function getUsedEdgeStyles(ir: SwimlaneIR): readonly string[] {
    const used = new Set(ir.edges.map((e) => e.style ?? "solid"))
    const ORDER = ["solid", "dashed", "thick"] as const
    return ORDER.filter((s) => used.has(s))
}

export { LEGEND_NODE_PER_ROW }

/**
 * 整张画布尺寸:矩阵 + 图例。
 */
export function computeCanvasSize(ir: SwimlaneIR): {
    width: number
    height: number
} {
    const totalColW = ir.phases.reduce(
        (sum, p) => sum + computeColWidth(ir, p.id),
        0,
    )
    return {
        width: LAYOUT.ORIGIN_X * 2 + LAYOUT.ROW_LABEL_W + totalColW,
        height: getMatrixBottomY(ir) + computeLegendHeight(ir),
    }
}
