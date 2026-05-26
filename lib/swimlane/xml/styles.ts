import type { EdgeStyle, NodeType } from "@/lib/swimlane/ir/schema"

/**
 * 9 种节点类型对应的 drawio 样式串。
 * 配色与 drawio 默认 sketch 主题对齐,飞书导入后视觉一致。
 */
export const NODE_STYLES: Record<NodeType, string> = {
    start: "ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontSize=12;",
    end: "ellipse;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;fontSize=12;",
    task: "rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;",
    decision:
        "rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=12;",
    subprocess:
        "rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;strokeWidth=2;fontSize=12;",
    data: "shape=parallelogram;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;fontSize=12;",
    document:
        "shape=note;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;fontSize=12;",
    manual: "shape=trapezoid;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=12;",
    system: "rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=12;",
}

/**
 * 边样式 3 种:
 * - solid: 主流程实线
 * - dashed: 异步/通知虚线
 * - thick: 关键路径粗线
 */
export const EDGE_STYLES: Record<EdgeStyle, string> = {
    solid: "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;fontSize=11;",
    dashed: "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;dashed=1;fontSize=11;",
    thick: "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;strokeWidth=2;fontSize=11;",
}

/**
 * 表头/单元格背景样式。
 */
export const FRAME_STYLES = {
    corner: "rounded=0;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;fontSize=11;fontStyle=2;",
    colHeader:
        "rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1;fontSize=13;",
    rowHeader:
        "rounded=0;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;fontStyle=1;fontSize=13;",
    cell: "rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#cccccc;dashed=1;",
    /** 图例 + 业务规则区域的外框,极简风:浅灰描边 + 圆角 + 微底色 */
    legend: "rounded=1;arcSize=4;whiteSpace=wrap;html=1;fillColor=#fafafa;strokeColor=#cccccc;strokeWidth=1;",
} as const
