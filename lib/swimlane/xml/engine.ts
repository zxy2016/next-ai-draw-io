import { create } from "xmlbuilder2"
import type { XMLBuilder } from "xmlbuilder2/lib/interfaces"
import type { EdgeStyle, NodeType, SwimlaneIR } from "@/lib/swimlane/ir/schema"
import {
    computeCanvasSize,
    computeColWidth,
    computeLegendInnerHeight,
    getCellOrigin,
    getMatrixBottomY,
    getNodePosition,
    getUsedEdgeStyles,
    getUsedNodeTypes,
    LAYOUT,
    LEGEND_NODE_PER_ROW,
} from "./layout"
import { EDGE_STYLES, FRAME_STYLES, NODE_STYLES } from "./styles"

/**
 * 把 IR 转换为符合 drawio 规范的 mxGraphModel XML。
 *
 * 规范关键点(参考官方 drawio SKILL):
 * - 不允许 XML 注释
 * - 每个 edge 必须带 <mxGeometry relative="1" as="geometry"/>
 * - 所有 id 全局唯一
 * - mxCell 顶层固定 id="0" 与 id="1"
 * - 特殊字符由 xmlbuilder2 自动转义,无需手工处理
 */
export function irToXml(ir: SwimlaneIR): string {
    const canvas = computeCanvasSize(ir)

    const doc = create({ version: "1.0", encoding: "UTF-8" })
    const mxfile = doc.ele("mxfile", {
        host: "app.diagrams.net",
        agent: "flow-swimlane-gen",
        version: "22.0.0",
    })
    const diagram = mxfile.ele("diagram", {
        id: "swimlane-diagram",
        name: ir.title,
    })
    const model = diagram.ele("mxGraphModel", {
        dx: "1200",
        dy: "800",
        grid: "1",
        gridSize: "10",
        guides: "1",
        tooltips: "1",
        connect: "1",
        arrows: "1",
        fold: "1",
        page: "1",
        pageScale: "1",
        pageWidth: String(Math.max(canvas.width, 1169)),
        pageHeight: String(Math.max(canvas.height, 826)),
        math: "0",
        shadow: "0",
    })
    const root = model.ele("root")

    // 固定根节点
    root.ele("mxCell", { id: "0" })
    root.ele("mxCell", { id: "1", parent: "0" })

    // === 表头区 ===
    addVertex(
        root,
        "corner",
        "角色 \\ 阶段",
        LAYOUT.ORIGIN_X,
        LAYOUT.ORIGIN_Y,
        LAYOUT.CORNER_W,
        LAYOUT.HEADER_H,
        FRAME_STYLES.corner,
    )

    // 列表头
    let xCursor = LAYOUT.ORIGIN_X + LAYOUT.ROW_LABEL_W
    for (const p of ir.phases) {
        const w = computeColWidth(ir, p.id)
        addVertex(
            root,
            `col-${p.id}`,
            p.name,
            xCursor,
            LAYOUT.ORIGIN_Y,
            w,
            LAYOUT.HEADER_H,
            FRAME_STYLES.colHeader,
        )
        xCursor += w
    }

    // 行表头
    ir.roles.forEach((r, i) => {
        const y = LAYOUT.ORIGIN_Y + LAYOUT.HEADER_H + i * LAYOUT.ROW_MIN_H
        addVertex(
            root,
            `row-${r.id}`,
            r.name,
            LAYOUT.ORIGIN_X,
            y,
            LAYOUT.ROW_LABEL_W,
            LAYOUT.ROW_MIN_H,
            FRAME_STYLES.rowHeader,
        )
    })

    // 单元格虚线背景
    for (const r of ir.roles) {
        let cx = LAYOUT.ORIGIN_X + LAYOUT.ROW_LABEL_W
        for (const p of ir.phases) {
            const w = computeColWidth(ir, p.id)
            const { y } = getCellOrigin(ir, r.id, p.id)
            addVertex(
                root,
                `cell-${r.id}-${p.id}`,
                "",
                cx,
                y,
                w,
                LAYOUT.ROW_MIN_H,
                FRAME_STYLES.cell,
            )
            cx += w
        }
    }

    // === 节点 ===
    for (const n of ir.nodes) {
        const pos = getNodePosition(ir, n)
        addVertex(
            root,
            n.id,
            n.label,
            pos.x,
            pos.y,
            pos.w,
            pos.h,
            NODE_STYLES[n.type],
        )
    }

    // === 边 ===
    for (const e of ir.edges) {
        const cell = root.ele("mxCell", {
            id: e.id,
            value: e.label ?? "",
            style: EDGE_STYLES[e.style ?? "solid"],
            edge: "1",
            parent: "1",
            source: e.from,
            target: e.to,
        })
        cell.ele("mxGeometry", { relative: "1", as: "geometry" })
    }

    // === 图例 & 规则说明(矩阵下方) ===
    addLegend(root, ir)

    return doc.end({ prettyPrint: true })
}

/** 纯文本 vertex 通用样式(无边框无填充)。 */
const TEXT_STYLE = "text;align=left;verticalAlign=middle;fontSize=11;"
/** 边图例两端的不可见 anchor 样式。 */
const ANCHOR_STYLE = "fillColor=none;strokeColor=none;"

/** 节点 type 的中文标签。 */
const NODE_LABEL: Record<NodeType, string> = {
    start: "起点 start",
    end: "终点 end",
    task: "任务 task",
    decision: "判断 decision",
    subprocess: "子流程 subprocess",
    data: "数据 data",
    document: "文档 document",
    manual: "人工 manual",
    system: "系统 system",
}

/** 边 style 的中文标签。 */
const EDGE_LABEL: Record<EdgeStyle, string> = {
    solid: "主流程",
    dashed: "异步 / 通知",
    thick: "关键路径",
}

/**
 * 在矩阵下方绘制图例与业务规则。
 *
 * 三段按需出现(自上而下):
 *   1. 节点形状:只显示本次 IR 中实际用到的 type
 *   2. 边样式:只显示本次 IR 中实际用到的 style
 *   3. 业务规则:来自 ir.rules,空时整段省略
 *
 * 风格:信息密度优先,不加装饰背景。
 */
function addLegend(root: XMLBuilder, ir: SwimlaneIR): void {
    const usedNodeTypes = getUsedNodeTypes(ir) as readonly NodeType[]
    const usedEdgeStyles = getUsedEdgeStyles(ir) as readonly EdgeStyle[]
    const rules = ir.rules ?? []
    const inner = computeLegendInnerHeight(ir)
    if (inner === 0) return // 三段都空,不渲染

    // === 外框 ===
    // 必须先于内容添加 - drawio 按 cell 顺序渲染,先添加在下层,后添加在上层
    const canvas = computeCanvasSize(ir)
    const frameX = LAYOUT.ORIGIN_X
    const frameY = getMatrixBottomY(ir) + LAYOUT.LEGEND_TOP_GAP
    const frameW = canvas.width - LAYOUT.ORIGIN_X * 2
    const frameH = inner + LAYOUT.LEGEND_FRAME_PAD * 2
    addVertex(
        root,
        "legend-frame",
        "",
        frameX,
        frameY,
        frameW,
        frameH,
        FRAME_STYLES.legend,
    )

    // 内容起点 = 框内左上 + padding
    const xStart = frameX + LAYOUT.LEGEND_FRAME_PAD
    let y = frameY + LAYOUT.LEGEND_FRAME_PAD
    let prevSection = false

    // ---------- 节点形状 ----------
    if (usedNodeTypes.length > 0) {
        for (let i = 0; i < usedNodeTypes.length; i++) {
            const t = usedNodeTypes[i]
            const row = Math.floor(i / LEGEND_NODE_PER_ROW)
            const col = i % LEGEND_NODE_PER_ROW
            const x = xStart + col * LAYOUT.LEGEND_NODE_ITEM_W
            const yi = y + row * LAYOUT.LEGEND_NODE_ROW_H
            addVertex(
                root,
                `legend-node-${t}`,
                "",
                x,
                yi,
                LAYOUT.LEGEND_NODE_SAMPLE_W,
                LAYOUT.LEGEND_NODE_SAMPLE_H,
                NODE_STYLES[t],
            )
            addVertex(
                root,
                `legend-node-${t}-label`,
                NODE_LABEL[t],
                x + LAYOUT.LEGEND_NODE_SAMPLE_W + 6,
                yi,
                LAYOUT.LEGEND_NODE_LABEL_W,
                LAYOUT.LEGEND_NODE_SAMPLE_H,
                TEXT_STYLE,
            )
        }
        const rows = Math.ceil(usedNodeTypes.length / LEGEND_NODE_PER_ROW)
        y += rows * LAYOUT.LEGEND_NODE_ROW_H
        prevSection = true
    }

    // ---------- 边样式 ----------
    if (usedEdgeStyles.length > 0) {
        if (prevSection) y += LAYOUT.LEGEND_SECTION_GAP
        for (let i = 0; i < usedEdgeStyles.length; i++) {
            const s = usedEdgeStyles[i]
            const x = xStart + i * LAYOUT.LEGEND_EDGE_ITEM_W
            const lineY = y + LAYOUT.LEGEND_EDGE_ROW_H / 2 - 2

            const anchorA = `legend-edge-${s}-a`
            const anchorB = `legend-edge-${s}-b`
            addVertex(root, anchorA, "", x, lineY, 4, 4, ANCHOR_STYLE)
            addVertex(
                root,
                anchorB,
                "",
                x + LAYOUT.LEGEND_EDGE_LINE_LEN,
                lineY,
                4,
                4,
                ANCHOR_STYLE,
            )
            const edge = root.ele("mxCell", {
                id: `legend-edge-${s}`,
                value: "",
                style: EDGE_STYLES[s],
                edge: "1",
                parent: "1",
                source: anchorA,
                target: anchorB,
            })
            edge.ele("mxGeometry", { relative: "1", as: "geometry" })

            addVertex(
                root,
                `legend-edge-${s}-label`,
                EDGE_LABEL[s],
                x + LAYOUT.LEGEND_EDGE_LINE_LEN + 12,
                y,
                LAYOUT.LEGEND_EDGE_LABEL_W,
                LAYOUT.LEGEND_EDGE_ROW_H,
                TEXT_STYLE,
            )
        }
        y += LAYOUT.LEGEND_EDGE_ROW_H
        prevSection = true
    }

    // ---------- 业务规则 ----------
    if (rules.length > 0) {
        if (prevSection) y += LAYOUT.LEGEND_SECTION_GAP
        const ruleW = frameW - LAYOUT.LEGEND_FRAME_PAD * 2
        for (let i = 0; i < rules.length; i++) {
            addVertex(
                root,
                `legend-rule-${i}`,
                `• ${rules[i]}`,
                xStart,
                y + i * LAYOUT.LEGEND_RULE_LINE_H,
                ruleW,
                LAYOUT.LEGEND_RULE_LINE_H,
                `${TEXT_STYLE}fontColor=#444;`,
            )
        }
    }
}

/**
 * 工具函数:向 root 写入一个 vertex mxCell。
 */
function addVertex(
    root: XMLBuilder,
    id: string,
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    style: string,
): void {
    const cell = root.ele("mxCell", {
        id,
        value,
        style,
        vertex: "1",
        parent: "1",
    })
    cell.ele("mxGeometry", {
        x: String(x),
        y: String(y),
        width: String(w),
        height: String(h),
        as: "geometry",
    })
}
