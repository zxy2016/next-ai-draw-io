import "server-only"
import { getFreeModeTools } from "./free-mode-tools"
import { getSwimlaneModeTools } from "./swimlane-mode-tools"

/**
 * Flow mode 枚举。
 *
 * - free:     默认通用 draw.io 模式(支持任意图)
 * - swimlane: 二维矩阵泳道图模式(IR + 确定性 XML 生成),Phase 3 接入
 */
export type FlowMode = "free" | "swimlane"

/**
 * 从 request header 解析 mode。
 * 默认 free,保证未升级前端的请求行为不变。
 */
export function parseFlowMode(
    headerValue: string | null | undefined,
): FlowMode {
    if (headerValue === "swimlane") return "swimlane"
    return "free"
}

/**
 * 根据 mode 返回对应的工具集。
 *
 * 注意:返回类型是 union(free 与 swimlane 的工具结构不同),由 streamText 的
 * tools 参数接受。TypeScript 不强制对齐两个分支的具体形状。
 */
export function getToolsForMode(mode: FlowMode) {
    switch (mode) {
        case "swimlane":
            return getSwimlaneModeTools()
        case "free":
        default:
            return getFreeModeTools()
    }
}
